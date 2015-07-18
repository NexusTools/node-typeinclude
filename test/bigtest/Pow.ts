@reference Processor

class Pow implements Processor {
    private of:number;
    constructor(of:number) {
        this.of = of || 2;
    }
    
    public process(data:number):number {
        return data*data;
    }
}

@main Pow