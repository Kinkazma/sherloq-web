(function (wp) {
  const h = wp.element.createElement;
  wp.blocks.registerBlockType('sherloq/browser', {
    apiVersion: 3, title: 'SHERLOQ Browser Lab', icon: 'search', category: 'media',
    attributes: { language: {type:'string',default:'fr'}, height:{type:'number',default:920} },
    edit({attributes, setAttributes}) {
      return h('div', wp.blockEditor.useBlockProps(),
        h(wp.blockEditor.InspectorControls, null,
          h(wp.components.PanelBody, {title:'SHERLOQ'},
            h(wp.components.SelectControl, {label:'Language / Langue', value:attributes.language, options:[{label:'Français',value:'fr'},{label:'English',value:'en'}], onChange:language=>setAttributes({language})}),
            h(wp.components.RangeControl, {label:'Height / Hauteur',value:attributes.height,min:560,max:1600,step:20,onChange:height=>setAttributes({height})}))),
        h('p', null, 'SHERLOQ · Browser analysis / Analyse dans le navigateur · ', h('a', {href:window.sherloqBrowserAssetURL+'#lang='+attributes.language,target:'_blank',rel:'noopener'}, 'Ouvrir l’espace de calcul / Open analysis workspace')),
        h('iframe', {title:'SHERLOQ preview',allow:'fullscreen',src:window.sherloqBrowserAssetURL+'#lang='+attributes.language,style:{width:'100%',height:attributes.height,border:0}}));
    }, save() { return null; }
  });
})(window.wp);
