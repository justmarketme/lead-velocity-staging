import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BrokerLayout from "@/components/broker/BrokerLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const leadSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(50, "First name must be less than 50 characters"),
  last_name: z.string().trim().min(1, "Last name is required").max(50, "Last name must be less than 50 characters"),
  email: z.string().trim().email("Invalid email address").max(255, "Email must be less than 255 characters"),
  phone: z.string().trim().min(1, "Phone is required").max(20, "Phone must be less than 20 characters"),
  source: z.string().max(50, "Source must be less than 50 characters").optional(),
  notes: z.string().max(1000, "Notes must be less than 1000 characters").optional(),
});

const csvLeadSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required"),
  last_name: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().email("Invalid email address"),
  phone: z.string().trim().min(1, "Phone is required"),
  source: z.string().optional(),
  notes: z.string().optional(),
});

interface CSVParseResult {
  valid: Array<{
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    source?: string;
    notes?: string;
  }>;
  errors: Array<{ row: number; message: string }>;
}

const BrokerUpload = () => {
  const [brokerId, setBrokerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvParseResult, setCsvParseResult] = useState<CSVParseResult | null>(null);
  const [serviceIntent, setServiceIntent] = useState("referral_generation");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    source: "Broker Book",
    notes: "",
  });

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }

      const { data: broker } = await supabase
        .from("brokers")
        .select("id")
        .eq("user_id", session.user.id)
        .single();

      if (broker) {
        setBrokerId(broker.id);
      }
    };
    checkAuth();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brokerId) return;

    setLoading(true);
    try {
      const validatedData = leadSchema.parse(formData);
      const batchTag = `Individual_${new Date().toISOString().split('T')[0]}`;

      const { error } = await supabase.from("leads").insert({
        broker_id: brokerId,
        ...validatedData,
        source: `${serviceIntent} | ${batchTag}`,
        current_status: "New",
      });

      if (error) throw error;

      toast({ title: "Success", description: "Client added to your book" });
      setFormData({ first_name: "", last_name: "", email: "", phone: "", source: "Broker Book", notes: "" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const parseCSV = (text: string): CSVParseResult => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return { valid: [], errors: [{ row: 0, message: "Empty file" }] };

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const valid: CSVParseResult['valid'] = [];
    const errors: CSVParseResult['errors'] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = line.split(',').map(v => v.trim());
      const row: any = {};
      headers.forEach((h, idx) => row[h] = values[idx]);

      try {
        const validated = csvLeadSchema.parse(row);
        valid.push(validated);
      } catch (err: any) {
        errors.push({ row: i + 1, message: "Invalid data format" });
      }
    }
    return { valid, errors };
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvParseResult(parseCSV(text));
    };
    reader.readAsText(file);
  };

  const handleBulkUpload = async () => {
    if (!csvParseResult || !brokerId) return;

    setIsUploading(true);
    const batchTag = `Book_${new Date().toISOString().split('T')[0]}`;
    const leads = csvParseResult.valid.map(l => ({
      ...l,
      broker_id: brokerId,
      source: `${serviceIntent} | ${batchTag}`,
      current_status: "New",
    }));

    const batchSize = 25;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      await supabase.from("leads").insert(batch);
      setUploadProgress(Math.round(((i + batch.length) / leads.length) * 100));
    }

    setIsUploading(false);
    toast({ title: "Upload Complete", description: `Uploaded ${leads.length} clients for processing.` });
    setCsvParseResult(null);
    setCsvFile(null);
  };

  return (
    <BrokerLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Upload Client Book</h1>
            <p className="text-muted-foreground mt-1">Provide your clients for referral generation & booking</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/broker/leads")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 border-border/50">
            <CardHeader>
              <CardTitle>How should we help these clients?</CardTitle>
              <CardDescription>Select the purpose of this client upload</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={serviceIntent} onValueChange={setServiceIntent}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Service" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="referral_generation">Referral Generation (Get 5 referrals each)</SelectItem>
                  <SelectItem value="appointment_booking">Appointment Booking (Schedule new meetings)</SelectItem>
                  <SelectItem value="policy_review">Policy Review (Retention & Satisfaction checks)</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle>Template</CardTitle>
              <CardDescription>Use our standard format</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" onClick={() => {
                const csvContent = "data:text/csv;charset=utf-8,first_name,last_name,email,phone,notes\nJohn,Doe,john@example.com,0123456789,Existing life client";
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", "client_upload_template.csv");
                document.body.appendChild(link);
                link.click();
              }}>
                <Download className="mr-2 h-4 w-4" /> Download CSV Template
              </Button>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="bulk" className="w-full">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="bulk">Bulk Upload (CSV)</TabsTrigger>
            <TabsTrigger value="single">Single Client</TabsTrigger>
          </TabsList>

          <TabsContent value="bulk" className="mt-4">
            <Card className="border-border/50">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-xl bg-card/30">
                  <Upload className="h-10 w-10 text-primary mb-4" />
                  <h3 className="text-lg font-semibold mb-1">Upload Your Client CSV</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
                    Drop your client list here. Our team will process these through our AI verification system.
                  </p>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="csv-upload"
                  />
                  <Label htmlFor="csv-upload" className="cursor-pointer">
                    <Button variant="secondary" className="pointer-events-none">
                      {csvFile ? csvFile.name : "Select CSV File"}
                    </Button>
                  </Label>
                </div>

                {csvParseResult && (
                  <div className="mt-6 space-y-4">
                    <Alert className={csvParseResult.errors.length > 0 ? "border-yellow-500/50 bg-yellow-500/5" : "border-green-500/50 bg-green-500/5"}>
                      {csvParseResult.errors.length > 0 ? <AlertCircle className="h-4 w-4 text-yellow-500" /> : <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      <AlertTitle>{csvParseResult.valid.length} Valid Clients Found</AlertTitle>
                      <AlertDescription>
                        {csvParseResult.errors.length > 0 && `${csvParseResult.errors.length} rows have minor errors and will be skipped.`}
                      </AlertDescription>
                    </Alert>

                    {isUploading && (
                      <div className="space-y-2">
                        <Progress value={uploadProgress} />
                        <p className="text-xs text-center text-muted-foreground">Uploading: {uploadProgress}%</p>
                      </div>
                    )}

                    <Button
                      className="w-full h-12 text-lg"
                      onClick={handleBulkUpload}
                      disabled={isUploading || csvParseResult.valid.length === 0}
                    >
                      Launch Processing Campaign
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="single" className="mt-4">
            <Card className="border-border/50 max-w-2xl">
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>First Name</Label><Input value={formData.first_name} onChange={e => setFormData({ ...formData, first_name: e.target.value })} required /></div>
                    <div className="space-y-2"><Label>Last Name</Label><Input value={formData.last_name} onChange={e => setFormData({ ...formData, last_name: e.target.value })} required /></div>
                  </div>
                  <div className="space-y-2"><Label>Email</Label><Input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Phone</Label><Input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Client Notes</Label><Textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={3} /></div>
                  <Button type="submit" className="w-full" disabled={loading}>{loading ? "Processing..." : "Add Client"}</Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </BrokerLayout>
  );
};

export default BrokerUpload;

