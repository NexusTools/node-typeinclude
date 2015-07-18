@nodereq path

declare var module:any;
(module).exports =  function() {
	return path.join("/test", "folder");
}
