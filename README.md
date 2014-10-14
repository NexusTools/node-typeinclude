node-typeinclude
----------------
node-typeinclude makes it easy to include typescript files into your nodejs project at runtime, without the need to recompile every time you change something.

class loading
-------------
node-typeinclude allows you @include typescript classes from the top of typescript files

```
@include SomeClass;

var instance = new SomeClass();
instance.doSomething();
```

usage
-----
```
var typeinclude = require("typeinclude");
var myTypeScriptClass = typeinclude("./myTypeScriptClass.ts");
myTypeScriptClass.someMethod();
```

or boot a typescript

```
var typeinclude = require("typeinclude");
typeinclude("index.ts");
```

or from the commandline

```
nodets index.ts
```

legal
-----
node-typeinclude is licensed under [Apache License V2](LICENSE.md)
