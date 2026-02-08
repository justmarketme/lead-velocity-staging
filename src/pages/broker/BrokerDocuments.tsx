import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BrokerLayout from "@/components/broker/BrokerLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FileText, Download, FolderOpen, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";

interface Document {
  id: string;
  name: string;
  description: string | null;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  category: string;
  created_at: string;
}

const BrokerDocuments = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuthAndFetch();
  }, []);

  const checkAuthAndFetch = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/login");
      return;
    }

    // Verify broker role
    const { data: hasRole } = await supabase.rpc('has_role', {
      _user_id: session.user.id,
      _role: 'broker'
    });

    if (!hasRole) {
      navigate("/login");
      return;
    }

    fetchSharedDocuments();
  };

  const fetchSharedDocuments = async () => {
    setLoading(true);
    
    // Get broker's ID
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: broker } = await supabase
      .from("brokers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!broker) {
      setLoading(false);
      return;
    }

    // Get shared documents
    const { data: shares } = await supabase
      .from("document_shares")
      .select("document_id")
      .eq("broker_id", broker.id);

    if (!shares || shares.length === 0) {
      setDocuments([]);
      setLoading(false);
      return;
    }

    const docIds = shares.map(s => s.document_id);
    
    const { data: docs, error } = await supabase
      .from("admin_documents")
      .select("*")
      .in("id", docIds)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching documents:", error);
      toast({
        title: "Error",
        description: "Failed to fetch documents",
        variant: "destructive",
      });
    } else {
      setDocuments(docs || []);
    }
    setLoading(false);
  };

  const handleDownload = async (doc: Document) => {
    try {
      const { data, error } = await supabase.storage
        .from("admin-documents")
        .download(doc.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Download Failed",
        description: error.message || "Failed to download document",
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "N/A";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      templates: "bg-blue-500",
      contracts: "bg-purple-500",
      invoices: "bg-green-500",
      policies: "bg-orange-500",
      general: "bg-gray-500",
    };
    return colors[category] || "bg-gray-500";
  };

  return (
    <BrokerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Documents</h1>
          <p className="text-muted-foreground mt-2">
            View and download documents shared with you
          </p>
        </div>

        {/* Quick Access */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Templates
            </CardTitle>
            <CardDescription>Download lead upload templates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-8 w-8 text-green-500" />
                <div>
                  <p className="font-medium">Lead Upload Template</p>
                  <p className="text-sm text-muted-foreground">CSV format for bulk lead uploads</p>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href="/templates/lead-upload-template.csv" download>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Shared Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Shared Documents
            </CardTitle>
            <CardDescription>Documents shared with you by the admin</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Loading documents...</p>
            ) : documents.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No documents shared with you yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Contact your admin for access to documents
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Shared On</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{doc.name}</p>
                          {doc.description && (
                            <p className="text-sm text-muted-foreground">{doc.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getCategoryColor(doc.category)}>
                          {doc.category}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatFileSize(doc.file_size)}</TableCell>
                      <TableCell>
                        {format(new Date(doc.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(doc)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </BrokerLayout>
  );
};

export default BrokerDocuments;
