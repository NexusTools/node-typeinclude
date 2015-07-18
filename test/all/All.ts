@include Your
@include Base

@plugin Whom

class All {
    
    public doBelong():String {
        var phrase:String = "All " + Your.your() + " " + Base.base() + " Are";
        Whom.impls.forEach(function(plugin:Whom) {
            phrase += " " + plugin.to();
        });
        return phrase;
    }
    
}

@main All