import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MessageSquare, Ticket, BarChart3 } from "lucide-react";
import Navbar from "@/components/Navbar";

// Safely import assets
import heroImg from "@/assets/hero-illustration.jpg";
import logo from "@/assets/uc-smarthelp-logo.jpg";

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // If a user is already logged in (or guest mode), redirect them to their dashboard.
  // To view the public home page while logged in, use `/?noRedirect=1`.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const skipRedirect = params.get("noRedirect") === "1" || params.get("noRedirect") === "true";
    if (skipRedirect) return;

    const userJson = localStorage.getItem("user");
    const isGuest = localStorage.getItem("uc_guest") === "1";
    if (isGuest) {
      return navigate("/GuestDashboard");
    }

    if (userJson) {
      const user = JSON.parse(userJson);
      const role = (user?.role || "student").toLowerCase();
      const department = (user?.department || "").toLowerCase();

      if (role === "admin") return navigate("/AdminDashboard");
      if (role === "staff") {
        if (department === "scholarship") return navigate("/ScholarshipDashboard");
        return navigate("/AccountingDashboard");
      }

      // Default student
      return navigate("/StudentDashboard");
    }
  }, [navigate, location.search]);

  const features = [
    { 
      icon: MessageSquare, 
      title: "Departmental Support", 
      desc: "Connect directly with specialized campus departments." 
    },
    { 
      icon: Ticket, 
      title: "Helpdesk Tickets", 
      desc: "Submit and track tickets to the right department." 
    },
    { 
      icon: BarChart3, 
      title: "Real-time Updates", 
      desc: "Stay updated with announcements and ticket status." 
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-grow">
        {/* Hero Section */}
        <section className="container flex flex-col-reverse items-center gap-12 py-16 md:flex-row md:py-24">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="flex-1 space-y-6 text-center md:text-left"
          >
            {/* Cropped Logo - Aggressive crop to remove bottom text and top cap */}
            <div className="flex justify-center md:justify-start relative group mb-4">
              <div className="absolute inset-0 bg-primary/10 rounded-full blur-3xl opacity-40 scale-150" />
              <div className="relative h-40 w-64 overflow-hidden flex items-center justify-center">
                <img 
                  src={logo} 
                  alt="UC SmartHelp Logo" 
                  className="w-full scale-[2.2] -translate-y-4 object-contain mix-blend-multiply contrast-[1.1] brightness-[1.05]"
                  onError={(e) => (e.currentTarget.style.display = 'none')} 
                />
              </div>
            </div>
            
            <h1 className="text-4xl font-extrabold leading-tight text-foreground md:text-6xl tracking-tight">
              WELCOME TO <span className="text-primary">UC SMARTHELP</span>
            </h1>
            
            <p className="max-w-md text-lg text-muted-foreground mx-auto md:mx-0">
              Your centralized hub for campus assistance. Get quick answers and connect with university services effortlessly.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
              <Button
                size="lg"
                className="uc-gradient-btn text-primary-foreground text-xl px-10 py-7 rounded-xl font-bold shadow-lg hover:scale-105 transition-transform"
                onClick={() => navigate("/login")}
              >
                GET STARTED
              </Button>
            </div>
          </motion.div>

          {/* Hero Illustration */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex-1 w-full"
          >
            <img
              src={heroImg}
              alt="SmartHelp illustration"
              className="mx-auto w-full max-w-lg drop-shadow-2xl rounded-2xl"
              loading="eager"
            />
          </motion.div>
        </section>

        {/* Features Section */}
        <section className="bg-secondary/30 py-20 border-y">
          <div className="container px-4">
            <h2 className="mb-16 text-center text-3xl md:text-4xl font-bold text-foreground">
              How We Support You
            </h2>
            <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-3">
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="group rounded-2xl bg-card p-8 text-center shadow-md border hover:shadow-xl hover:-translate-y-2 transition-all duration-300"
                >
                  <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <f.icon className="h-8 w-8" />
                  </div>
                  <h3 className="mb-3 text-2xl font-bold text-foreground">{f.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-10 bg-card">
        <div className="container text-center">
          <p className="text-sm font-medium text-muted-foreground">
            © {new Date().getFullYear()} UC SmartHelp. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;