import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, Phone, MapPin, X } from "lucide-react";
import { getLoggedInRedirectPath } from "@/lib/utils";
const Contact = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container max-w-3xl py-16 space-y-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-foreground flex-1">Contact Us</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(getLoggedInRedirectPath())}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-6 w-6" />
        </Button>
      </div>
      <div className="grid gap-6 sm:grid-cols-3">
        <Card className="text-center">
          <CardContent className="pt-6 space-y-2">
            <Mail className="mx-auto h-8 w-8 text-primary" />
            <p className="font-medium text-foreground">Email</p>
            <p className="text-sm text-muted-foreground">ucsmarthelp@gmail.com</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-6 space-y-2">
            <Phone className="mx-auto h-8 w-8 text-primary" />
            <p className="font-medium text-foreground">Phone</p>
            <p className="text-sm text-muted-foreground">09087027436</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-6 space-y-2">
            <MapPin className="mx-auto h-8 w-8 text-primary" />
            <p className="font-medium text-foreground">Address</p>
            <p className="text-sm text-muted-foreground">Sanciangko St., Cebu City</p>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
};

export default Contact;
