require('string.prototype.startswith');
require('string.prototype.endswith');

var child_process = require("child_process");
var crypto = require('crypto');
var sleep = require('sleep');
var path = require('path');
var fs = require('fs');
var os = require('os');

var includereg = /^@include (\w+)$/gm;

process.env.TYPESCRIPTINCLUDE_CACHENAMESPACE = process.env.TYPESCRIPTINCLUDE_CACHENAMESPACE || process.getuid();
var scriptDirectory = path.dirname(process.argv[1]);
var scriptTempDirectory = os.tmpdir();
scriptTempDirectory += path.sep + "typeinclude-cache" + path.sep;
var baseTempDirectory = scriptTempDirectory;
scriptTempDirectory += process.env.TYPESCRIPTINCLUDE_CACHENAMESPACE + path.sep;

if(!("execSync" in child_process)) {
	child_process.execSync = function(command, output) {
		var doneFile = scriptTempDirectory + "_tsi.done";
		try {
			fs.unlinkSync(doneFile);
		} catch(e) {}
		var cmdline = command + " ";
		if(output)
			cmdline += "2>&1 > \"" + output + "\" ";
		cmdline += "|| true; touch " + doneFile;
		child_process.exec(cmdline);
		console.log(cmdline);
		
		while (!fs.existsSync(doneFile)) {
			sleep.sleep(1);
		}
		fs.unlinkSync(doneFile);
	}
}

var typeinclude = function(script) {
	script = path.resolve(scriptDirectory, script);
	if(!script.endsWith(".ts"))
		script += ".ts";
	
	try {
		fs.mkdirSync(baseTempDirectory);
	} catch(e) {
		if(e.code != "EEXIST")
			throw e;
	}
	try {
		fs.mkdirSync(scriptTempDirectory, 0755);
	} catch(e) {
		if(e.code != "EEXIST")
			throw e;
	}
	var shasum = crypto.createHash('sha512');
	shasum.update(script);
	var hashDigest = shasum.digest("hex");
	var outputFile = scriptTempDirectory + hashDigest.substring(0, 12) + path.sep;
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
	outputFile += hashDigest.substring(80) + ".js";
	
	var scriptStat = fs.statSync(script);
	try {
		var outStat = fs.statSync(outputFile);
		if(scriptStat.mtime > outStat.mtime)
			throw "Script modified since last compiled";
	} catch(e) {
		var modified = false;
		// TODO: Make this read part by part, not load the entire thing into memory
		var content = fs.readFileSync(script, {encoding: "utf8"});
		var pos, end;

		if(content.match(includereg)) {
			content = "var _typeinclude = require(\"typeinclude\");\n" + content;
			content = content.replace(includereg, "var $1 = _typeinclude(\"$1\")");
			script = outputFile + "." + path.basename(script);
			fs.writeFileSync(script, content);		
			console.log(content);
		}

		// TODO: Change this to use .spawnSync instead
		child_process.execSync("tsc -module \"commonjs\" -out \"" + outputFile + "\" \"" + script + "\"", outputFile + ".log");
		try {
			fs.utimesSync(outputFile, scriptStat.atime, scriptStat.mtime);
		} catch(e) {
			throw "Failed to compile: " + script + "\nCheck " + outputFile + ".log for details";
		}
	}
	
	return require(outputFile);
}

module.exports = typeinclude;
