// Bootstrap must not import validators or engine resources before the
// dependency worker has migrated. Read only the language hint; full recovery
// remains owned by the normal preference layer after dependency preparation.
export function readStartupLanguage(storage) {
 try {
  storage ??= globalThis.localStorage;
  const key='sherloq.workspace.preferences';
  const raw=storage?.getItem('sherloq.recovery.value.'+key)??storage?.getItem(key);
  if(raw===null||raw===undefined)return undefined;
  const language=JSON.parse(raw)?.language;
  return language==='fr'||language==='en'?language:undefined;
 } catch {return undefined;}
}
