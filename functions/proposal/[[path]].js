// The local prototype and its extracted materials are not public production assets.
export function onRequest(){return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}})}
