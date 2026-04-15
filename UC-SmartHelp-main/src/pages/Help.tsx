import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { getLoggedInRedirectPath } from "@/lib/utils";

const sections = [
  {
    title: "Library",
    items: [
      ["What floor is the library?", "The entrance is on the 3rd floor, and the exit is on the 4th floor."],
      ["What are the library hours?", "The UC Main Campus Library is open from Monday to Friday, 8:00 AM to 6:00 PM, and on Saturdays from 8:00 AM to 12:00 PM. Hours may vary during holidays or exam periods."],
    ],
  },
  {
    title: "Uniform and Dress Code",
    items: [
      ["What are the requirements for uniform exemptions?", "You need to submit a letter. If employed, you must provide a Certificate of Employment and fill out an exemption form. This does not apply to HM and Criminology students or working scholars."],
      ["How do I process a uniform exemption?", "You need to go to the SAO, submit your letter, and fill out the required form."],
      ["What are the qualifications for a uniform exemption?", "Pregnant students, LGBTQ students, and those employed outside the campus."],
      ["Is there a dress code?", "Yes. Slippers and Crocs are not allowed; only shoes are permitted. Shorts are not allowed; students must wear pants. Skirts should not be more than 3 inches above the knee. Hair color and excessive earrings are prohibited."],
    ],
  },
  {
    title: "Enrollment and Payments",
    items: [
      ["I paid the tuition/enrollment fee online. What should I do next?", "Take a screenshot of the receipt and upload it to the portal."],
      ["How can I pay online?", "You can pay via bank. BDO: University of Cebu, Inc. - 001850000016 | MetroBank: University of Cebu - 094-3-01142638-7 | ASPAC: University of Cebu Main - 11-0101-00333-3 | UnionBank: University of Cebu Inc. - 001130008682 | PS Bank: University of Cebu - 109112000487"],
      ["Where can I get my receipt if I paid online?", "You can claim your receipt at the cashier's office. Just present a screenshot or proof of payment."],
      ["What documents do I need to enroll/register?", "You will need: high school diploma or college transcript of records, Certificate of Good Moral Character, birth certificate (original and photocopy), valid ID, and payment receipt for enrollment fees."],
    ],
  },
  {
    title: "Campus Offices and Services",
    items: [
      ["Where is the Registrar's Office?", "The Registrar's Office is located on the ground floor of the Admin Building near the quadrangle. It is on the left side if you are facing the cashier/accounting office."],
      ["What services are offered in the clinic?", "Medical and dental services (cleaning, filling, and tooth extraction)."],
      ["Is dental service free?", "Yes, dental services are free as they are included in the miscellaneous fees."],
      ["Is medical service free?", "Yes, medical services are also included in the miscellaneous fees."],
      ["What is insurance and why do I need it?", "Insurance provides coverage in case of accidents inside the campus."],
    ],
  },
];

const Help = () => {
  const navigate = useNavigate();

  const handleClose = () => {
    navigate(getLoggedInRedirectPath());
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-10 space-y-6">
        <div className="space-y-2 relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="absolute right-0 top-0 text-muted-foreground hover:text-foreground"
            aria-label="Close help"
          >
            <X className="h-6 w-6" />
          </Button>
          <h1 className="text-3xl font-extrabold tracking-tight">FAQ Section</h1>
        </div>

        <div className="grid gap-4">
          {sections.map((section) => (
            <Card key={section.title}>
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {section.items.map(([q, a]) => (
                  <div key={q} className="rounded-lg border bg-muted/20 p-4">
                    <p className="font-semibold">Q: {q}</p>
                    <p className="text-sm text-muted-foreground mt-1">A: {a}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Help;
