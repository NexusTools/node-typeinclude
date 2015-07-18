class BasicClass {
	public something(arg:number) {
		return 83*arg;
	}
}


declare var module:any;
(module).exports = new BasicClass();
