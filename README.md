[![Package Version](https://img.shields.io/npm/v/typeinclude.svg)](https://www.npmjs.org/package/typeinclude) [![Build Status](https://travis-ci.org/NexusTools/node-typeinclude.svg)](https://travis-ci.org/NexusTools/node-typeinclude) [![Apache License 2.0](http://img.shields.io/hexpm/l/plug.svg)](http://www.apache.org/licenses/LICENSE-2.0.html) [![Coverage Status](https://img.shields.io/coveralls/NexusTools/node-typeinclude.svg)](https://coveralls.io/r/NexusTools/node-typeinclude) [![Gratipay Tips](https://img.shields.io/gratipay/NexusTools.svg)](https://gratipay.com/NexusTools/)

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
var path = require("path");
var typeinclude = require("typeinclude");
var myTypeScriptClass = typeinclude("myTypeScriptClass.ts", __dirname + path.sep + "folder with typescript relative to current file");
myTypeScriptClass.someMethod();
```

or from the commandline

```
nodets index.ts
```

legal
-----
node-typeinclude is licensed under [Apache License 2.0](LICENSE.md)
