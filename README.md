[![Package Version](https://img.shields.io/npm/v/typeinclude.svg)](https://www.npmjs.org/package/typeinclude) [![Build Status](https://travis-ci.org/NexusTools/node-typeinclude.svg)](https://travis-ci.org/NexusTools/node-typeinclude) [![Apache License 2.0](http://img.shields.io/hexpm/l/plug.svg)](http://www.apache.org/licenses/LICENSE-2.0.html) [![Coverage Status](https://img.shields.io/coveralls/NexusTools/node-typeinclude.svg)](https://coveralls.io/r/NexusTools/node-typeinclude) [![Gratipay Tips](http://img.shields.io/gratipay/ktaeyln.svg)](https://gratipay.com/ktaeyln/)

node-typeinclude
----------------
node-typeinclude makes it easy to include typescript files into your nodejs project at runtime, without the need to recompile every time you change something.

```
npm install -g typeinclude
```

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
node-typeinclude is licensed under [Apache License 2.0](LICENSE.md)
