@reference Processor
@include Pow

class BigTest {
    private processors:Processor[] = [];
    
    constructor() {
        this.processors.push(new Pow());
        this.processors.push(new Pow(5));
    }
    
    public run(data:number):number {
        this.processors.forEach(function(processor) {
            data = processor.process(data);
        });
        return data;
    }
}

@main BigTest