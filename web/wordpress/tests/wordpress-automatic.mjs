// Local WordPress only. Never publishes the draft or changes the 96 MP run.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
const require=createRequire(new URL('../../web-engine-integration/package.json',import.meta.url));
const {chromium}=require('playwright');
const setup=await fs.readFile('../coordination-private/web-release/local-wordpress/setup.php','utf8');
const user=setup.match(/\$username='([^']+)'/)[1],password=setup.match(/'user_pass'=>'([^']+)'/)[1];
const out='verification/wordpress';await fs.mkdir(out,{recursive:true});
const proof={checks:[],errors:[],requestFailures:[]},check=(name,pass,details)=>{proof.checks.push({name,pass,details});console.log(JSON.stringify({check:name,pass}));if(!pass)throw Error(name);};
const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1500,height:1100}});const page=await context.newPage();
page.on('requestfailed',r=>proof.requestFailures.push({url:r.url(),error:r.failure()?.errorText}));page.on('pageerror',e=>proof.errors.push(e.message));proof.console=[];page.on('console',m=>{if(m.type()==='error')proof.console.push(m.text());});
try{
 await page.goto('http://127.0.0.1:8097/wp-login.php',{timeout:180000,waitUntil:'domcontentloaded'});await page.locator('#user_login').fill(user);await page.locator('#user_pass').fill(password);await page.locator('#wp-submit').click();
 await page.waitForURL(/wp-admin/,{timeout:180000,waitUntil:'domcontentloaded'});await page.goto('http://127.0.0.1:8097/wp-admin/post.php?post=1599&action=edit',{timeout:180000,waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.wp?.data?.select('core/editor')?.getCurrentPostId()===1599,{},{timeout:180000});
 const content=await page.evaluate(()=>wp.data.select('core/editor').getEditedPostContent());check('Real draft contains SHERLOQ block',content.includes('wp:sherloq/browser'));
 await page.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(e=>e.title==='SHERLOQ preview')||[...document.querySelectorAll('iframe')].some(e=>e.contentDocument?.querySelector('iframe[title="SHERLOQ preview"]')),{},{timeout:60000});
 if(!page.frames().some(f=>f.url().includes('/assets/app.html')))await page.waitForEvent('framenavigated',{predicate:f=>f.url().includes('/assets/app.html'),timeout:60000});const appFrame=page.frames().find(f=>f.url().includes('/assets/app.html'));check('Gutenberg app frame loaded',!!appFrame,page.frames().map(f=>f.url()));await appFrame.waitForFunction(()=>typeof document.querySelector('#tab-automatic')?.onclick==='function');await appFrame.waitForSelector('#automatic-controls',{state:'attached'});check('Gutenberg renders the integrated interface',!!appFrame);
 await page.evaluate(async()=>{const block=wp.data.select('core/block-editor').getBlocks().find(b=>b.name==='sherloq/browser');wp.data.dispatch('core/block-editor').updateBlockAttributes(block.clientId,{language:'en'});await wp.data.dispatch('core/editor').savePost();});
 await page.reload({timeout:180000,waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.wp?.data?.select('core/editor')?.getCurrentPostId()===1599,{},{timeout:180000});
 check('Edited block language survives save and reload',await page.evaluate(()=>wp.data.select('core/block-editor').getBlocks().find(b=>b.name==='sherloq/browser')?.attributes.language)==='en');
 await page.evaluate(async content=>{wp.data.dispatch('core/block-editor').resetBlocks(wp.blocks.parse(content));await wp.data.dispatch('core/editor').savePost();},content);
 check('Original draft content restored',await page.evaluate(()=>wp.data.select('core/editor').getEditedPostContent())===content);
 await page.screenshot({path:out+'/gutenberg.png',fullPage:true});
 await page.goto('http://127.0.0.1:8097/?page_id=1599&preview=true',{timeout:180000,waitUntil:'domcontentloaded'});
 const frame=await page.waitForSelector('iframe[title="SHERLOQ"]');const app=await frame.contentFrame();await app.waitForFunction(()=>typeof document.querySelector('#tab-automatic')?.onclick==='function');
 const state=await app.evaluate(()=>({isolated:crossOriginIsolated,sab:typeof SharedArrayBuffer!=='undefined',automatic:!!document.querySelector('#automatic-run')}));
 check('WordPress page preview preserves shared-memory isolation',state.isolated&&state.sab&&state.automatic,state);
 await app.locator('#tab-automatic').click();await app.locator('#automatic-controls').waitFor({state:'visible'});
 const png=await app.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=64;c.getContext('2d').fillRect(0,0,64,64);return c.toDataURL('image/png').split(',')[1];});
 await app.locator('#file').setInputFiles({name:'wordpress-source-64.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await app.waitForFunction(()=>!document.querySelector('#automatic-run').disabled&&document.querySelector('#file-info').textContent.includes('64 × 64'),{},{timeout:60000});check('Real WordPress iframe worker decodes original source',true);
 await page.screenshot({path:out+'/preview.png',fullPage:true});check('No unhandled WordPress browser error',!proof.errors.length,proof.errors);proof.passed=true;
}catch(error){proof.passed=false;proof.error=error.message;process.exitCode=1;await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});}
finally{await fs.writeFile(out+'/proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));await browser.close();}
