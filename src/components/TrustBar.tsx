import { ShieldCheck, Users, Zap } from "lucide-react";

const TrustBar = () => {
    const items = [
        { icon: Users, text: "Former Broker Founders" },
        { icon: ShieldCheck, text: "Double-Verified Prospects" },
        { icon: Zap, text: "Consistent Weekly Pipeline" },
    ];

    return (
        <div className="w-full bg-card/50 backdrop-blur-md border-y border-primary/20 py-6 overflow-hidden">
            <div className="container mx-auto px-4">
                <div className="flex flex-wrap justify-center md:justify-between items-center gap-8 md:gap-4">
                    {items.map((item, index) => (
                        <div
                            key={index}
                            className="flex items-center space-x-3 group animate-fade-in"
                            style={{ animationDelay: `${index * 0.1}s` }}
                        >
                            <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                                <item.icon className="w-5 h-5 text-primary" />
                            </div>
                            <span className="text-sm md:text-base font-semibold text-muted-foreground tracking-wide group-hover:text-primary transition-colors uppercase">
                                {item.text}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TrustBar;
