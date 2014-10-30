var _ = require('underscore');
var path = require('path');
var fs = require('fs');

var $break = new Object();
var paths = function(paths) {
    try {
        if(arguments.length > 1) {
            this._paths = _.flatten(arguments);
            try {
                if(!_.isFunction(this._paths[0]))
                    throw "Not a function";
                this._resolve = this._paths.splice(0, 1)[0];
            } catch(e) {}
        } else if(_.isArray(paths))
            this._paths = _.flatten(paths);
        else if(_.isObject(paths)) {
            if("_paths" in paths) {
                this._paths = paths._paths;
                this._resolve = paths._resolve || _.identity;
                return;
            } else if(_.isFunction(paths)) {
                this._resolve = paths;
                this._paths = [];
                return;
            } else
                throw new Error("Cannot handle `" + Object.prototype.toString.apply(paths) + "`\n" + paths);
        } else if(paths)
            this._paths = ["" + paths];
        else
            this._paths = [];

            
    } finally {
        this._resolve = this._resolve || _.identity;
    }
};
paths.isInstance = function(other) {
    try {
        if(!_.isArray(other._paths))
            throw "";
        return true;
    } catch(e) {}
    return false;
}
paths.wrap = function(other) {
    if(paths.isInstance(other))
        return other;
    return new paths(Array.prototype.slice.call(arguments, 0));
}
paths.prototype.at = function(pos) {
    return this._paths[pos];
};
paths.prototype.count = function() {
    return this._paths.length;
};
paths.prototype.get = function(overrides) {
    var combinedPath;
    if(overrides && overrides != ".") {
        if(arguments.length > 1) {
            var path = this;
            Array.prototype.forEach.apply(arguments, [function(arg) {
                path = path.get(arg);
            }]);
            return path;
        } else if(_.isArray(overrides))
            overrides = _.flatten(overrides);
        else if(_.isObject(overrides)) {
            if(paths.isInstance(overrides)) {
                if(overrides == this)
                    return this;
                overrides = overrides._paths;
            } else
                throw new Error("Cannot handle `" + Object.prototype.toString.apply(overrides) + "`\n" + overrides);
        } else
            overrides = ("" + overrides).split(":");
        return new paths(this._resolve, _.union(overrides, this._paths));
    }
    return this;
};
paths.prototype.clear = function() {
    this._paths = [];
};
paths.prototype.add = function(newpath) {
    if(arguments.length > 1) {
        var self = this;
        Array.prototype.forEach.apply(arguments, [function(arg) {
            self.add(arg);
        }]);
        return;
    } else if(_.isArray(newpath)) {
        if(newpath.length < 1)
            return;
        newpath = _.flatten(newpath);
    } else if(_.isObject(newpath)) {
        if(paths.isInstance(newpath)) {
            if(newpath == this)
                return this;
            newpath = newpath._paths;
        } else
            throw new Error("Cannot handle `" + Object.prototype.toString.apply(newpath) + "`\n" + newpath);
    } else if(newpath) {
        newpath = ["" + newpath];
        if(this.has(newpath[0]))
            return;
    } else
        return;
    this._paths = _.union(newpath, this._paths);
};
paths.prototype.has = function(cpath) {
    return this._paths.indexOf(cpath + "") != -1;
};
paths.prototype.remove = function(cpath) {
    if(arguments.length > 1) {
        var self = this;
        Array.prototype.forEach.apply(arguments, [function(arg) {
            self.remove(arg);
        }]);
        return;
    } else if(_.isArray(cpath))
        cpath = _.flatten(cpath);
    else if(_.isObject(cpath)) {
        if(paths.isInstance(cpath)) {
            if(this === cpath) {
                this._paths = []
                return;
            }
            cpath = cpath._paths;
        } else
            throw new Error("Cannot handle `" + Object.prototype.toString.apply(cpath) + "`\n" + cpath);
    } else {
        cpath = ["" + cpath];
        if(!this.has(cpath[0]))
            return;
    }
    this._paths = _.without(this._paths, cpath);
};
paths.prototype.forEach = function(iterator) {
    this._paths.forEach(iterator);
};
paths.prototype.resolve = function(resolver, _paths, lookDeep) {
    if(_.isArray(_paths) || _.isObject(_paths))
        _paths = this._paths.get(_paths);
    else if(_paths)
        _paths = this._paths.get(("" + _paths).split(":"));
    else
        _paths = this._paths;
    
    if(!_.isFunction(resolver)) {
        var childString = this._resolve(path.normalize("" + resolver));
        resolver = function(_path) {
            return path.resolve(_path, childString);
        };
        resolver.toString = function() {
            return childString;
        };
    }
        
    var resolved;
    try {
        if(lookDeep)
            _paths.forEach(function(_path) {
                var files;
                try {
                    files = fs.readdirSync(_path);
                } catch(e) {
                    return;
                }
                files.forEach(function(child) {
                    var childPath = path.resolve(_path, child);
                    var resolvedPath = resolver(childPath);
                    if(fs.existsSync(resolvedPath)) {
                        resolved = resolvedPath;
                        throw $break;
                    }
                });
            });
        else
            _paths.forEach(function(_path) {
                var resolvedPath = resolver(_path);
                if(fs.existsSync(resolvedPath)) {
                    resolved = resolvedPath;
                    throw $break;
                }
            });
    } catch(e) {
        if(e !== $break)
            throw e;
    }
    if(!resolved)
        throw new Error("Cannot resolve `" + resolver + "` from " + _paths);
    return resolved;
};
paths.prototype.toString = function() {
    return JSON.stringify(this);
}
module.exports = paths;