@reference interface

class InterfaceReference implements MyInterface {
	constructor(keep:Number) {
		keep = keep || 6;
		this.test = "Father".substring(0, keep);
	}
	
	public method() {
		return this.test;
	}
}

module.exports = InterfaceReference;
