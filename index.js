require('string.prototype.startswith');
require('string.prototype.endswith');

var usleep = require("sleep").usleep;
var child_process = require("child_process");
var crypto = require('crypto');
var path = require('path');
var fs = require('fs');
var os = require('os');

if(!("spawnSync" in child_process)) {
	child_process.spawnSync = function(command, args, opts) {
		var doneFile = tempDirectory + "_tsc.done";
		try {
			fs.unlinkSync(doneFile);
		} catch(e) {}
		// TODO: Improve concatenation, this is hacky...
		var cmdline = command + " \"" + args.join("\" \"") + "\" || true; touch " + doneFile;
		child_process.spawn('sh', ['-c', cmdline], opts);
		if(process.env.TYPEINCLUDE_VERBOSE)
			console.log(cmdline);
		
		while (!fs.existsSync(doneFile)) {
			usleep(100000); // 100ms
		}
		fs.unlinkSync(doneFile);
		
		return {}; // Fake it because I don't think we can make it... without native code...
	}
}

var nodereqreg = /^@nodereq (\w+|.+\:\w+)$/gm;
var includereg = /^@include (\w+|.+\:\w+)$/gm;
var referencereg = /^@reference ([\w\.\-\/]+)$/gm;
var mainreg = /^@main (\w+)$/gm;
var specificreg = /^(.+)\:(\w+)$/;

function cleanArg(arg) {
	if(/^["'].+["']$/.test(arg)) // Strip quotes
		return arg.substring(1, arg.length-1);
	return arg;
}

function splitArg(raw) {
	var specificMatch = raw.match(specificreg);
	if(specificMatch) {// Allows lib:varname syntax
		return [specificMatch[2], specificMatch[1]];
	}
	return [raw.replace(/\W/g, "_"), raw];
}

var processDirectory = path.dirname(process.argv[1]);
process.env.TYPESCRIPTINCLUDE_CACHENAMESPACE = process.env.TYPESCRIPTINCLUDE_CACHENAMESPACE || process.getuid();
var tempDirectory = os.tmpdir();
tempDirectory += path.sep + "typeinclude-cache" + path.sep;
var baseTempDirectory = tempDirectory;
tempDirectory += process.env.TYPESCRIPTINCLUDE_CACHENAMESPACE + path.sep;

global.__typeinclude__loadcache__ = {};

var typeinclude = function(script, basepath, ignoreCaches) {
	if(process.env.TYPEINCLUDE_VERBOSE)
		console.log("Compiling", script, "from", basepath);
	script = path.resolve(basepath, script);
	var scriptBaseDirectory = path.dirname(script);
	basepath = basepath || scriptBaseDirectory;
	if(!script.endsWith(".ts"))
		script += ".ts";
	if(!ignoreCaches && script in global.__typeinclude__loadcache__)
		return global.__typeinclude__loadcache__[script];
	var realScriptPath = script;
	
	try {
		fs.mkdirSync(baseTempDirectory);
	} catch(e) {
		if(e.code != "EEXIST")
			throw e;
	}
	try {
		fs.mkdirSync(tempDirectory, 0755);
	} catch(e) {
		if(e.code != "EEXIST")
			throw e;
	}
	var shasum = crypto.createHash('sha512');
	shasum.update(script);
	var hashDigest = shasum.digest("hex");
	var outputFile = tempDirectory + hashDigest.substring(0, 12) + path.sep;
	try {
		fs.mkdirSync(outputFile, 0755);
	} catch(e) {
		if(e.code != "EEXIST")
			throw e;
	}
	outputFile += hashDigest.substring(12, 80) + path.sep;
	try {
		fs.mkdirSync(outputFile, 0755);
	} catch(e) {
		if(e.code != "EEXIST")
			throw e;
	}
	outputFile += hashDigest.substring(80) + path.sep;
	try {
		fs.mkdirSync(outputFile, 0755);
	} catch(e) {
		if(e.code != "EEXIST")
			throw e;
	}
	var outputFolder = outputFile;
	outputFile += path.basename(script, '.ts');
	var outputBase = outputFile;
	outputFile += ".js";
	
	var scriptStat = fs.statSync(script);
	try {
		var outStat = fs.statSync(outputFile);
		if(scriptStat.mtime > outStat.mtime)
			throw "Script modified since last compiled";
	} catch(e) {
		var outputLog = outputBase + ".log";
		try {
			fs.unlinkSync(outputFile);
		} catch(e) {}
		try {
			fs.unlinkSync(outputLog);
		} catch(e) {}
	
		var needRequire = false;
		// TODO: Make this read part by part, not load the entire thing into memory
		var content = fs.readFileSync(script, {encoding: "utf8"});
		if(content.match(includereg)) {
			needRequire = true;
			content = "var _typeinclude = require(\"" + __filename + "\");\n" + content;
			content = content.replace(includereg, function(match, p1, offset, string) {
				p1 = splitArg(cleanArg(p1));
				return "\n/// <reference path=\"" + p1[1] + "\" />\nvar " + p1[0] + " = _typeinclude(\"" + p1[1] + "\", \"" + basepath + "\")";
			});
		}
		if(content.match(referencereg)) {
			content = content.replace(referencereg, function(match, p1, offset, string) {
				p1 = cleanArg(p1);
				if(!p1.endsWith(".ts"))
					p1 += ".ts";
				return "/// <reference path=\"" + p1 + "\" />";
			});
		}
		if(content.match(nodereqreg)) {
			needRequire = true;
			content = content.replace(nodereqreg, function(match, p1, offset, string) {
				p1 = splitArg(cleanArg(p1));
				return "var " + p1[0] + ":Function = require(\"" + p1[1] + "\")";
			});
		}
		if(content.match(mainreg)) {
			content = content.replace(mainreg, function(match, p1, offset, string) {
				return "module.exports = " + p1 + ";";
			});
		}
		if(needRequire)
			content = "declare var require:Function;\n" + content;
		content = "var __filename = \"" + realScriptPath + "\"\nvar __dirname = \"" + scriptBaseDirectory + "\"\n" + content;
		
		script = outputBase + ".ts";
		fs.writeFileSync(script, content);

		// TODO: Change this to use .spawnSync instead
		var result = child_process.spawnSync("tsc", ["--module", "commonjs", "--out", outputFile, script], {
			stdio: ["ignore", fs.openSync(outputLog, 'a'), fs.openSync(outputLog, 'a')]
				});
		
		try {
			if(result.error)
				throw result.error;
			if(fs.statSync(outputFile).size < 1)
				throw "Generated empty file";
			fs.utimesSync(outputFile, scriptStat.atime, scriptStat.mtime);
		} catch(e) {
			try {
				fs.unlinkSync(outputFile);
			} catch(e) {}
			try {
				fs.unlinkSync(outputLog);
			} catch(e) {}
			
			console.error("Compile Error:", e);
			throw "Failed to compile: " + script + "\nCheck " + outputLog + " for details";
		}
	}
	
	var requireInstance = require(outputFile);
	if(!ignoreCaches)
		global.__typeinclude__loadcache__[realScriptPath] = requireInstance;
	return requireInstance;
}

module.exports = typeinclude;
