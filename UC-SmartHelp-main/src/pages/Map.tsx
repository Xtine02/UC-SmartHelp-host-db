import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { getLoggedInRedirectPath } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, MapPin, info } from "lucide-react";

// Import images m2 to m6
import m2 from "@/assets/m2 (2).png";
import m3 from "@/assets/m3 (2).png";
import m4 from "@/assets/m4.png";
import m5 from "@/assets/m5.png";
import m6 from "@/assets/m6.png";

const MAP_BUILDING = "Admin Building";

const FLOOR_CONFIG: Record<string, { desc: string; img: string }> = {
    "2nd Floor": { desc: "Main Library, Registrar, and Student Affairs", img: m2 },
    "3rd Floor": { desc: "College Library, Computer Labs, and Faculty Rooms", img: m3 },
    "4th Floor": { desc: "Don Manuel Gotianuy Building - Engineering Dept", img: m4 },
    "5th Floor": { desc: "Allied Engineering Building - Laboratories", img: m5 },
    "6th Floor": { desc: "Executive Offices and Conference Halls", img: m6 },
};

const Map = () => {
    const navigate = useNavigate();
    const [selectedFloor, setSelectedFloor] = useState<string>("");

    return (
        <div className="min-h-screen bg-slate-50">
            <Navbar />

            <div className="container py-10 max-w-6xl space-y-6">
                {/* Header Section */}
                <div className="flex items-center justify-between bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                    <div className="flex items-center gap-4">
                        <div className="bg-emerald-100 p-3 rounded-2xl">
                            <MapPin className="text-emerald-600 h-6 w-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Campus Navigator</h1>
                            <p className="text-sm text-slate-500 font-medium">{MAP_BUILDING} Overview</p>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => navigate(getLoggedInRedirectPath())} className="rounded-full">
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                <div className="grid lg:grid-cols-12 gap-6">
                    {/* Sidebar - Selection */}
                    <div className="lg:col-span-4 space-y-4">
                        <Card className="rounded-[2rem] border-none shadow-lg">
                            <CardHeader>
                                <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-400">Select Floor</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {Object.keys(FLOOR_CONFIG).map((floor) => (
                                    <button
                                        key={floor}
                                        onClick={() => setSelectedFloor(floor)}
                                        className={`w-full p-4 rounded-2xl text-left font-bold transition-all flex items-center justify-between group ${selectedFloor === floor
                                                ? "bg-emerald-600 text-white shadow-emerald-200 shadow-lg scale-[1.02]"
                                                : "bg-slate-50 text-slate-600 hover:bg-white hover:shadow-md border border-transparent hover:border-emerald-100"
                                            }`}
                                    >
                                        {floor}
                                        <div className={`h-2 w-2 rounded-full ${selectedFloor === floor ? "bg-white animate-pulse" : "bg-slate-300"}`} />
                                    </button>
                                ))}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Main Content - Map Display */}
                    <div className="lg:col-span-8">
                        {selectedFloor ? (
                            <Card className="rounded-[2.5rem] overflow-hidden border-none shadow-2xl bg-white">
                                <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-emerald-50/30">
                                    <div>
                                        <h2 className="text-xl font-black text-slate-800 italic uppercase">{selectedFloor}</h2>
                                        <p className="text-emerald-700 text-sm font-semibold">{FLOOR_CONFIG[selectedFloor].desc}</p>
                                    </div>
                                </div>
                                <div className="p-4 bg-slate-900 flex items-center justify-center min-h-[500px]">
                                    <img
                                        key={selectedFloor}
                                        src={FLOOR_CONFIG[selectedFloor].img}
                                        alt={selectedFloor}
                                        className="w-full h-auto object-contain max-h-[600px] animate-in fade-in zoom-in-95 duration-500"
                                    />
                                </div>
                            </Card>
                        ) : (
                            <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200 text-slate-400 space-y-4 p-12">
                                <div className="p-6 bg-slate-50 rounded-full">
                                    <MapPin className="h-10 w-10 opacity-20" />
                                </div>
                                <div className="text-center">
                                    <p className="font-bold text-lg text-slate-600">No Floor Selected</p>
                                    <p className="text-sm max-w-[200px]">Please select a floor from the sidebar to view the layout.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Map;