import test from'node:test';import{selfDMWindowControls}from'./selfdm-window-context-controls.js';
for(const[name,work]of selfDMWindowControls)test(name,work);
