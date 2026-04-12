import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X } from "lucide-react";

interface BuildingFloors {
  [key: string]: string[];
}

const BUILDINGS: BuildingFloors = {
  "Admin Building": ["1st Floor", "2nd Floor", "3rd Floor", "4th Floor", "5th Floor", "6th Floor"],
  "Gotianoy Building": ["Ground Floor", "1st Floor", "2nd Floor"],
  "Engineering Building": ["Ground Floor", "1st Floor", "2nd Floor", "3rd Floor"],
};

const FLOOR_DATA: Record<string, Record<string, string>> = {
  "Admin Building": {
    "1st Floor": "Ground level - Main entrance, reception area",
    "2nd Floor": "Administrative offices, registrar office",
    "3rd Floor": "Dean's office, faculty offices",
    "4th Floor": "Meeting rooms, conference rooms",
    "5th Floor": "Library extension, study areas",
    "6th Floor": "Executive offices, board room",
  },
  "Gotianoy Building": {
    "Ground Floor": "Main lobby, classrooms",
    "1st Floor": "Lecture halls, laboratories",
    "2nd Floor": "Computer labs, studios",
  },
  "Engineering Building": {
    "Ground Floor": "Entrance, workshops",
    "1st Floor": "Labs and studios",
    "2nd Floor": "Classrooms",
    "3rd Floor": "Research facilities",
  },
};

const Map = () => {
  const navigate = useNavigate();
  const [selectedBuilding, setSelectedBuilding] = useState<string>("");
  const [selectedFloor, setSelectedFloor] = useState<string>("");

  // Get available floors for the selected building
  const availableFloors = selectedBuilding ? BUILDINGS[selectedBuilding] : [];

  // Reset floor when building changes
  const handleBuildingChange = (value: string) => {
    setSelectedBuilding(value);
    setSelectedFloor("");
  };

  // Handle floor selection
  const handleFloorChange = (value: string) => {
    setSelectedFloor(value);
  };

  const getFloorInfo = () => {
    if (!selectedBuilding || !selectedFloor) return null;
    return FLOOR_DATA[selectedBuilding]?.[selectedFloor] || "Floor information not available";
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container py-12 space-y-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Campus Map</h1>
            <p className="text-muted-foreground">
              Navigate through different buildings and floors of University of Cebu
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-6 w-6" />
          </Button>
        </div>

        {/* Selection Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Building Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Select Building</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedBuilding} onValueChange={handleBuildingChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a building..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(BUILDINGS).map((building) => (
                    <SelectItem key={building} value={building}>
                      {building}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedBuilding && (
                <p className="text-sm text-muted-foreground mt-3">
                  Selected: <span className="font-semibold text-foreground">{selectedBuilding}</span>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Floor Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Select Floor</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedFloor}
                onValueChange={handleFloorChange}
                disabled={!selectedBuilding}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={selectedBuilding ? "Choose a floor..." : "Select a building first"} />
                </SelectTrigger>
                <SelectContent>
                  {availableFloors.map((floor) => (
                    <SelectItem key={floor} value={floor}>
                      {floor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedFloor && (
                <p className="text-sm text-muted-foreground mt-3">
                  Selected: <span className="font-semibold text-foreground">{selectedFloor}</span>
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Map Display Area */}
        {selectedBuilding && selectedFloor ? (
          <Card className="border-2">
            <CardHeader>
              <CardTitle>
                {selectedBuilding} - {selectedFloor}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full bg-muted/20 rounded-lg p-8 flex items-center justify-center min-h-[300px]">
                <div className="text-center max-w-md">
                  <p className="text-lg font-semibold text-foreground mb-4">{selectedFloor}</p>
                  <p className="text-muted-foreground">{getFloorInfo()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-2 border-dashed">
            <CardContent className="pt-12 pb-12">
              <div className="text-center text-muted-foreground space-y-2">
                <p className="text-lg font-semibold">Select a Building and Floor</p>
                <p className="text-sm">Choose a building above and then select a floor to view the map</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Map;
