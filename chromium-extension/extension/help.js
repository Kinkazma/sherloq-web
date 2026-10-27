// Shared, local help. Shortcut labels follow the user's saved bindings.
export function quickHelpText(preferences,language='fr'){
 const fr=language==='fr',s=preferences.shortcuts,t=(a,b)=>fr?a:b;
 return {title:t('Aide','Help'),close:t('Fermer','Close'),intro:t('Cliquez sur l’icône SHERLOQ dans les extensions du navigateur, puis survolez une image. Aucun clic sur l’image n’est nécessaire. Depuis un PDF ouvert dans le navigateur, cette même icône ouvre le lecteur SHERLOQ.','Click the SHERLOQ icon in your browser’s extensions, then hover over an image. You do not need to click the image. On a PDF already open in the browser, the same icon opens the SHERLOQ reader.'),commands:[
  [s.settings,t('Ouvrir ou fermer les réglages. La loupe reste figée pendant le réglage.','Open or close settings. The magnifier stays pinned while you adjust them.')],
  ['↑ / ↓',t('Agrandir ou réduire le diamètre de la loupe.','Increase or decrease the magnifier diameter.')],
  ['← / →',t('Réduire ou élargir la bande de transition.','Narrow or widen the transition band.')],
  [t('Molette','Wheel'),t('Changer le grossissement. « Taille automatique » rétablit le diamètre adapté à la fenêtre et la transition de 60 pixels.','Change magnification. “Automatic size” restores a diameter fitted to the window and a 60-pixel transition.')],
  [s.sweep,t('Démarrer ou arrêter le balayage du paramètre choisi. Chaque palier est calculé et affiché.','Start or stop sweeping the chosen parameter. Each step is calculated and displayed.')],
  [s.decrease+' / '+s.increase,t('Diminuer ou augmenter le paramètre choisi, avec votre pas. Les réglages généraux permettent d’ajouter d’autres paires de touches.','Decrease or increase the chosen parameter with your step size. General settings let you add more key pairs.')],
  ['Alt / '+s.original,t('Maintenir pour voir l’image sans les effets.','Hold to see the image without effects.')],
  [s.mark+' · '+s.previousMark+' / '+s.nextMark,t('Enregistrer les réglages comme repère ; revenir au repère précédent ou suivant.','Bookmark the settings; return to the previous or next bookmark.')],
  [s.export,t('Exporter l’image affichée en PNG.','Export the displayed image as PNG.')],
  [s.basket,t('Ajouter l’image à la sélection pour le traitement par lot.','Add the image to the selection for batch processing.')],
  [s.ocr,t('OCR de la zone affichée dans la loupe, hors transition ; le texte est copié. Cette fonction facultative demande votre accord avant tout téléchargement manquant.','OCR on the area inside the magnifier, excluding its transition; the text is copied. This optional feature asks before downloading missing resources.')],
  [s.close,t('Sur une page web : couper l’extension. Dans le lecteur PDF : activer ou couper la loupe.','On a web page: turn off the extension. In the PDF reader: toggle the magnifier.')],
  ['Web / Local',t('Ouvrir l’image dans SHERLOQ web ou dans votre version emportée. Dans le lecteur PDF, le document PDF d’origine est transmis.','Open the image in SHERLOQ web or your portable version. In the PDF reader, the original PDF is transferred.')],
  ['⚙',t('Ouvrir les réglages généraux et personnaliser les raccourcis. Les conflits connus sont signalés.','Open general settings and customize shortcuts. Known conflicts are flagged.')]
 ],effects:t('Dans les réglages : préréglages, niveau, largeur de niveau, gamma, saturation, égalisation et anneaux. Cliquez sur un nombre pour le saisir, utilisez ses petites flèches ou déplacez son curseur.','Settings include presets, level, window width, gamma, saturation, equalization and rings. Click a number to type it, use its small arrows or move its slider.'),navigation:t('Dans le lecteur PDF, quand la loupe est coupée : molette ou pincement pour zoomer, trackpad ou glisser pour déplacer, double-clic pour ajuster la page. Les raccourcis de la loupe laissent les champs de texte et les menus utilisables.','In the PDF reader, with the magnifier off: wheel or pinch to zoom, trackpad or drag to pan, double-click to fit the page. Magnifier shortcuts leave text fields and menus usable.')};
}
export function mountQuickHelp({button,getPreferences,language,modal=()=>{}}){
 const dialog=document.createElement('dialog');dialog.className='sherloq-product-help';dialog.id='quick-help-dialog';dialog.setAttribute('aria-labelledby','quick-help-title');document.body.append(dialog);let previous;
 const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
 function sync(){const text=quickHelpText(getPreferences(),language());button.title=text.title;button.setAttribute('aria-label',text.title);return text;}
 function show(){if(dialog.open)return;const text=sync();previous=document.activeElement;dialog.replaceChildren();const header=el('header'),title=el('h2',text.title),close=el('button','×');title.id='quick-help-title';close.type='button';close.className='icon-button';close.setAttribute('aria-label',text.close);close.onclick=()=>dialog.close();header.append(title,close);dialog.append(header,el('p',text.intro),el('p',text.effects));const commands=el('dl');for(const [key,description]of text.commands)commands.append(el('dt',key),el('dd',description));dialog.append(commands,el('p',text.navigation));modal(true);dialog.showModal();}
 dialog.addEventListener('click',event=>{const r=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))dialog.close();});
 dialog.addEventListener('close',()=>{modal(false);previous?.focus?.({preventScroll:true});});button.onclick=show;sync();
 return {show,sync,dispose(){if(dialog.open)dialog.close();dialog.remove();button.onclick=null;}};
}
