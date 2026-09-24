// Admin governance console for the shared meadow (Feature 7, U4). Pure logic
// (who may act on whom, row ordering, link building) is exported for node
// --test; the DOM factory follows the spaces.js pattern — the module owns its
// button and dialog, main.js only wires the room client and state accessors.
// The server enforces every role rule; hiding controls client-side is
// convenience, never the security boundary.
import {shareLinkUrl} from './net/client.js';

// The console governs only for the admin; everyone else sees the claim form.
export function canGovern(role) {
  return role === 'admin';
}

// Member rows for the console list: the local player first (always
// recognizable), then everyone alphabetically. Input is the live presence
// state; output is a plain view-model, never a reference into the roster.
export function memberRows(members, selfId) {
  const rows = members.map((m) => ({...m, self: m.id === selfId}));
  rows.sort((a, b) => (a.self !== b.self ? (a.self ? -1 : 1) : a.name.localeCompare(b.name)));
  return rows;
}

// Which actions the viewer's row offers. The server refuses everything the
// matrix forbids; this list only decides what is worth showing.
// Self: nothing. Admin targets: nothing (admin transfers via passphrase).
// Everyone else (for the admin): role toggle, kick, ban.
export function memberActions(viewerRole, member) {
  if (viewerRole !== 'admin' || member.self || member.role === 'admin') return [];
  return [member.role === 'editor' ? 'revoke-editor' : 'grant-editor', 'kick', 'ban'];
}

export function actionLabel(action) {
  return action === 'grant-editor' ? 'Make editor'
    : action === 'revoke-editor' ? 'Revoke editor'
      : action === 'kick' ? 'Kick'
        : action === 'ban' ? 'Ban' : action;
}

export function inviteLabel(role) {
  return role === 'editor' ? 'Editor link' : 'Guest link';
}

const CLAIM_HINT = 'The first visitor to submit the room passphrase becomes the admin. A later claim transfers the role to the new admin.';

export function createGovernance({client, doc = document, members, selfRole, shareBase, notify}) {
  const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText;

  const button = doc.createElement('button');
  button.id = 'governance-toggle';
  button.type = 'button';
  button.textContent = 'Governance';
  doc.getElementById('player-badge').append(button);

  const dialog = doc.createElement('dialog');
  dialog.id = 'governance-dialog';
  dialog.innerHTML = `<div class="picker-heading"><h2>Room governance</h2><button type="button" aria-label="Close governance">×</button></div><p class="hint" id="governance-role-hint"></p><section id="governance-admin"><div class="section-title">Members</div><div id="governance-members"></div><div class="section-title">Share links</div><div class="button-pair"><button type="button" id="governance-link-editor">Editor link</button><button type="button" id="governance-link-guest">Guest link</button></div><p class="hint">A link admits anyone who opens it with the named role. Kicking and banning still apply.</p><output id="governance-link" hidden></output></section><section id="governance-claim-section"><div class="section-title">Becoming admin</div><label for="governance-passphrase">Room passphrase</label><input id="governance-passphrase" type="password" autocomplete="off"><div class="button-pair"><button type="button" id="governance-claim">Claim admin</button></div><p class="hint">${CLAIM_HINT}</p></section>`;
  doc.body.append(dialog);

  const roleHint = dialog.querySelector('#governance-role-hint');
  const adminSection = dialog.querySelector('#governance-admin');
  const claimSection = dialog.querySelector('#governance-claim-section');
  const memberList = dialog.querySelector('#governance-members');
  const linkOut = dialog.querySelector('#governance-link');
  const passphrase = dialog.querySelector('#governance-passphrase');

  const closeButton = dialog.querySelector('.picker-heading button');
  closeButton.addEventListener('click', () => dialog.close());

  function renderMembers() {
    const viewerRole = selfRole();
    for (const row of memberList.querySelectorAll('.member-row')) row.remove();
    for (const member of memberRows(members(), client.identity.id)) {
      const row = doc.createElement('div');
      row.className = 'member-row';
      const name = doc.createElement('span');
      name.className = 'member-name';
      name.textContent = member.self ? `${member.name} (you)` : member.name;
      const badge = doc.createElement('span');
      badge.className = `role-badge role-${member.role}`;
      badge.textContent = member.role;
      row.append(name, badge);
      for (const action of memberActions(viewerRole, member)) {
        const actionButton = doc.createElement('button');
        actionButton.type = 'button';
        actionButton.textContent = actionLabel(action);
        if (action === 'ban') actionButton.classList.add('danger');
        actionButton.addEventListener('click', () => {
          if (action === 'grant-editor') client.changeRole(member.id, 'editor');
          else if (action === 'revoke-editor') client.changeRole(member.id, 'guest');
          else if (action === 'kick') client.kick(member.id);
          else client.ban(member.id);
        });
        row.append(actionButton);
      }
      memberList.append(row);
    }
  }

  function renderSections() {
    const admin = canGovern(selfRole());
    adminSection.hidden = !admin;
    claimSection.hidden = admin;
    roleHint.textContent = admin ? 'You are the admin of this room.'
      : selfRole() === 'editor' ? 'You are an editor of this room.'
        : 'You are a guest of this room.';
  }

  async function offerLink(role, token) {
    const url = shareLinkUrl(shareBase(), token);
    linkOut.textContent = url;
    linkOut.hidden = false;
    notify(`${inviteLabel(role)} ready${canCopy ? ' — copied to your clipboard' : ''}`);
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch (error) {
      // Clipboard may be denied (permissions, focus) — the URL stays visible
      // in the console, so the user loses nothing but the shortcut.
      notify(`${inviteLabel(role)} is shown below — copy it manually.`);
    }
  }

  dialog.querySelector('#governance-link-editor').addEventListener('click', () => client.mintLink('editor'));
  dialog.querySelector('#governance-link-guest').addEventListener('click', () => client.mintLink('guest'));
  dialog.querySelector('button#governance-claim').addEventListener('click', () => {
    const value = passphrase.value;
    if (!value) return;
    passphrase.value = '';
    client.claim(value);
  });

  function open() {
    renderSections();
    renderMembers();
    dialog.showModal();
  }

  // Room events reach the console through main.js's single onEvent switch.
  function onRoomEvent(event) {
    if (!dialog.open) return;
    switch (event.type) {
      case 'welcome': case 'player-join': case 'player-update': case 'player-remove':
        renderSections();
        renderMembers();
        break;
      case 'roleChange':
        renderSections();
        renderMembers();
        break;
      case 'share-link':
        offerLink(event.role, event.token);
        break;
      case 'error':
        if (event.code === 'CLAIM_REJECTED') notify('That passphrase was rejected.');
        break;
      default: break;
    }
  }

  return {open, onRoomEvent, dialog, button};
}
