@target ES5

class ES5Test {
    private _test:number;
    
    get test() {
        return this._test;
    }
    set test(data:number) {
        this._test = data*2;
    }
}

@main ES5Test;