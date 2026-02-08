import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

const leadSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(50, "First name must be less than 50 characters"),
  last_name: z.string().trim().min(1, "Last name is required").max(50, "Last name must be less than 50 characters"),
  email: z.string().trim().email("Invalid email address").max(255, "Email must be less than 255 characters"),
  phone: z.string().trim().min(1, "Phone is required").max(20, "Phone must be less than 20 characters"),
  source: z.string().max(50, "Source must be less than 50 characters").optional(),
  broker_id: z.string().uuid("Valid broker must be selected"),
  notes: z.string().max(1000, "Notes must be less than 1000 characters").optional(),
});

const csvLeadSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required"),
  last_name: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().email("Invalid email address"),
  phone: z.string().trim().min(1, "Phone is required"),
  source: z.string().optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

interface Broker {
  id: string;
  firm_name: string;
  contact_person: string;
}

interface CSVParseResult {
  valid: Array<{
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    source?: string;
    date_uploaded?: string;
    notes?: string;
  }>;
  errors: Array<{ row: number; message: string }>;
}

const LeadUploadForm = () => {
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    source: "website_form",
    broker_id: "",
    notes: "",
  });
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(false);
  const [csvBrokerId, setCsvBrokerId] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvParseResult, setCsvParseResult] = useState<CSVParseResult | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchBrokers();
  }, []);

  const fetchBrokers = async () => {
    const { data, error } = await supabase
      .from("brokers")
      .select("id, firm_name, contact_person")
      .eq("status", "Active")
      .order("firm_name");

    if (!error && data) {
      setBrokers(data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validatedData = leadSchema.parse(formData);

      const { error } = await supabase.from("leads").insert([
        {
          first_name: validatedData.first_name,
          last_name: validatedData.last_name,
          email: validatedData.email,
          phone: validatedData.phone,
          source: validatedData.source || null,
          broker_id: validatedData.broker_id,
          notes: validatedData.notes || null,
          current_status: "New",
        },
      ]);

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Lead added successfully",
        });
        setFormData({
          first_name: "",
          last_name: "",
          email: "",
          phone: "",
          source: "website_form",
          broker_id: "",
          notes: "",
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "An unexpected error occurred",
          variant: "destructive",
        });
      }
    }

    setLoading(false);
  };

  const downloadTemplate = () => {
    const link = document.createElement('a');
    link.href = '/templates/lead-upload-template.csv';
    link.download = 'lead-upload-template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const parseCSV = (text: string): CSVParseResult => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      return { valid: [], errors: [{ row: 0, message: "CSV file must have a header row and at least one data row" }] };
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const requiredHeaders = ['first_name', 'last_name', 'email', 'phone'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    
    if (missingHeaders.length > 0) {
      return { valid: [], errors: [{ row: 0, message: `Missing required columns: ${missingHeaders.join(', ')}` }] };
    }

    const valid: CSVParseResult['valid'] = [];
    const errors: CSVParseResult['errors'] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(',').map(v => v.trim());
      const row: Record<string, string> = {};
      
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });

      try {
        const validated = csvLeadSchema.parse(row);
        valid.push({
          first_name: validated.first_name,
          last_name: validated.last_name,
          email: validated.email,
          phone: validated.phone,
          source: validated.source || undefined,
          date_uploaded: validated.date ? new Date(validated.date).toISOString() : undefined,
          notes: validated.notes || undefined,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          errors.push({ row: i + 1, message: error.errors[0].message });
        }
      }
    }

    return { valid, errors };
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: "Invalid File",
        description: "Please select a CSV file",
        variant: "destructive",
      });
      return;
    }

    setCsvFile(file);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const result = parseCSV(text);
      setCsvParseResult(result);
    };
    reader.readAsText(file);
  };

  const handleBulkUpload = async () => {
    if (!csvParseResult || csvParseResult.valid.length === 0 || !csvBrokerId) {
      toast({
        title: "Error",
        description: "Please select a valid CSV file and broker",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const leads = csvParseResult.valid.map(lead => ({
      ...lead,
      broker_id: csvBrokerId,
      current_status: "New",
    }));

    let successCount = 0;
    const batchSize = 50;
    const batches = Math.ceil(leads.length / batchSize);

    for (let i = 0; i < batches; i++) {
      const batch = leads.slice(i * batchSize, (i + 1) * batchSize);
      const { error } = await supabase.from("leads").insert(batch);
      
      if (!error) {
        successCount += batch.length;
      }
      
      setUploadProgress(Math.round(((i + 1) / batches) * 100));
    }

    setIsUploading(false);

    if (successCount === leads.length) {
      toast({
        title: "Success",
        description: `Successfully uploaded ${successCount} leads`,
      });
      setCsvFile(null);
      setCsvParseResult(null);
      setCsvBrokerId("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } else {
      toast({
        title: "Partial Success",
        description: `Uploaded ${successCount} of ${leads.length} leads`,
        variant: "destructive",
      });
    }
  };

  const resetCsvUpload = () => {
    setCsvFile(null);
    setCsvParseResult(null);
    setCsvBrokerId("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold gradient-text">Upload Leads</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add Single Lead</CardTitle>
            <CardDescription>Manually add a new lead to the database</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name</Label>
                  <Input
                    id="first_name"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="broker">Assign to Broker</Label>
                <Select
                  value={formData.broker_id}
                  onValueChange={(value) => setFormData({ ...formData, broker_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a broker" />
                  </SelectTrigger>
                  <SelectContent>
                    {brokers.map((broker) => (
                      <SelectItem key={broker.id} value={broker.id}>
                        {broker.firm_name} - {broker.contact_person}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="source">Lead Source</Label>
                <Select
                  value={formData.source}
                  onValueChange={(value) => setFormData({ ...formData, source: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="website_form">Website Form</SelectItem>
                    <SelectItem value="referral">Referral</SelectItem>
                    <SelectItem value="campaign">Campaign</SelectItem>
                    <SelectItem value="cold_call">Cold Call</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Add any additional notes about this lead..."
                  className="min-h-[80px]"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Adding..." : "Add Lead"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Bulk CSV Upload
            </CardTitle>
            <CardDescription>Upload multiple leads from a CSV file</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" onClick={downloadTemplate} className="w-full">
              <Download className="mr-2 h-4 w-4" />
              Download CSV Template
            </Button>

            <div className="space-y-2">
              <Label htmlFor="csv-broker">Assign to Broker</Label>
              <Select value={csvBrokerId} onValueChange={setCsvBrokerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a broker for all leads" />
                </SelectTrigger>
                <SelectContent>
                  {brokers.map((broker) => (
                    <SelectItem key={broker.id} value={broker.id}>
                      {broker.firm_name} - {broker.contact_person}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="csv-file">Upload CSV File</Label>
              <Input
                ref={fileInputRef}
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="cursor-pointer"
              />
            </div>

            {csvParseResult && (
              <div className="space-y-3">
                {csvParseResult.valid.length > 0 && (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Ready to Upload</AlertTitle>
                    <AlertDescription>
                      {csvParseResult.valid.length} valid lead(s) found
                    </AlertDescription>
                  </Alert>
                )}

                {csvParseResult.errors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Validation Errors</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc list-inside mt-2 text-sm">
                        {csvParseResult.errors.slice(0, 5).map((err, idx) => (
                          <li key={idx}>Row {err.row}: {err.message}</li>
                        ))}
                        {csvParseResult.errors.length > 5 && (
                          <li>...and {csvParseResult.errors.length - 5} more errors</li>
                        )}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {isUploading && (
                  <div className="space-y-2">
                    <Progress value={uploadProgress} />
                    <p className="text-sm text-muted-foreground text-center">
                      Uploading... {uploadProgress}%
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={handleBulkUpload}
                    disabled={!csvBrokerId || csvParseResult.valid.length === 0 || isUploading}
                    className="flex-1"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload {csvParseResult.valid.length} Lead(s)
                  </Button>
                  <Button variant="outline" onClick={resetCsvUpload}>
                    Reset
                  </Button>
                </div>
              </div>
            )}

            {!csvParseResult && (
              <div className="flex flex-col items-center justify-center min-h-[150px] border-2 border-dashed border-border rounded-lg">
                <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm text-center">
                  Select a CSV file to preview
                </p>
                <p className="text-xs text-muted-foreground text-center mt-1">
                  Required: first_name, last_name, email, phone
                </p>
                <p className="text-xs text-muted-foreground text-center">
                  Optional: source, date, notes
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LeadUploadForm;