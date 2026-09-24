if(new URLSearchParams(location.search).has('catalog')){document.body.replaceChildren();import('./catalog.js');}
else import('./main.js');
