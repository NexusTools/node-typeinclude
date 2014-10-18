@target ES5

class ES5Test {
    private _test:number;
    
    get test() {
        return _test;
    }
    set test(data:number) {
        _test = data*2;
    }
}

@main ES5Test;