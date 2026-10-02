const src = $('__SRC__').first().json.msgs || [];
return src.map((json) => ({ json }));
