import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Download, Trash2, FolderOpen, FileSpreadsheet, Share2, Users, FileCheck, Receipt, Eye, Edit3 } from "lucide-react";
import { format } from "date-fns";
import ProposalGenerator from "./ProposalGenerator";
import InvoiceGenerator from "./InvoiceGenerator";
import ContractGenerator from "./ContractGenerator";

interface Document {
  id: string;
  name: string;
  description: string | null;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  category: string;
  created_at: string;
  content_data?: any;
}

interface Broker {
  id: string;
  firm_name: string;
  contact_person: string;
  email: string | null;
}

interface DocumentShare {
  broker_id: string;
}

const CATEGORIES = [
  { value: "templates", label: "Templates" },
  { value: "contracts", label: "Contracts" },
  { value: "invoices", label: "Invoices" },
  { value: "policies", label: "Policies" },
  { value: "general", label: "General" },
];

const AdminDocuments = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [documentShares, setDocumentShares] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [uploadCategory, setUploadCategory] = useState<string>("general");
  const [description, setDescription] = useState("");
  const [sharingDocId, setSharingDocId] = useState<string | null>(null);
  const [selectedBrokers, setSelectedBrokers] = useState<string[]>([]);

  // Generators State
  const [showProposalGenerator, setShowProposalGenerator] = useState(false);
  const [showInvoiceGenerator, setShowInvoiceGenerator] = useState(false);
  const [showContractGenerator, setShowContractGenerator] = useState(false);
  const [editingDocData, setEditingDocData] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchDocuments();
    fetchBrokers();
    fetchAllShares();
  }, []);

  const fetchBrokers = async () => {
    const { data } = await supabase
      .from("brokers")
      .select("id, firm_name, contact_person, email")
      .eq("status", "Active")
      .order("firm_name");
    if (data) setBrokers(data);
  };

  const fetchAllShares = async () => {
    const { data } = await supabase
      .from("document_shares")
      .select("document_id, broker_id");

    if (data) {
      const shares: Record<string, string[]> = {};
      data.forEach((share: { document_id: string; broker_id: string }) => {
        if (!shares[share.document_id]) shares[share.document_id] = [];
        shares[share.document_id].push(share.broker_id);
      });
      setDocumentShares(shares);
    }
  };

  const fetchDocuments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("admin_documents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching documents:", error);
      toast({
        title: "Error",
        description: "Failed to fetch documents",
        variant: "destructive",
      });
    } else {
      setDocuments(data || []);
    }
    setLoading(false);
  };

  const openShareDialog = (docId: string) => {
    setSharingDocId(docId);
    setSelectedBrokers(documentShares[docId] || []);
  };

  const sendDocumentNotification = async (brokerId: string, documentName: string, documentCategory: string) => {
    const broker = brokers.find(b => b.id === brokerId);
    if (!broker?.email) {
      console.log(`No email for broker ${brokerId}, skipping notification`);
      return;
    }

    try {
      const response = await supabase.functions.invoke('send-document-notification', {
        body: {
          documentName,
          documentCategory,
          recipientEmail: broker.email,
          recipientName: broker.contact_person,
        },
      });

      if (response.error) {
        console.error('Failed to send notification:', response.error);
      } else {
        console.log('Document notification sent to:', broker.email);
      }
    } catch (error) {
      console.error('Error sending document notification:', error);
    }
  };

  const handleShare = async () => {
    if (!sharingDocId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get the document being shared
      const sharedDoc = documents.find(d => d.id === sharingDocId);

      // Get current shares for this document
      const currentShares = documentShares[sharingDocId] || [];

      // Determine brokers to add and remove
      const toAdd = selectedBrokers.filter(id => !currentShares.includes(id));
      const toRemove = currentShares.filter(id => !selectedBrokers.includes(id));

      // Remove shares
      if (toRemove.length > 0) {
        await supabase
          .from("document_shares")
          .delete()
          .eq("document_id", sharingDocId)
          .in("broker_id", toRemove);
      }

      // Add new shares
      if (toAdd.length > 0) {
        const newShares = toAdd.map(brokerId => ({
          document_id: sharingDocId,
          broker_id: brokerId,
          shared_by: user.id,
        }));
        await supabase.from("document_shares").insert(newShares);

        // Send email notifications to newly added brokers
        if (sharedDoc) {
          for (const brokerId of toAdd) {
            await sendDocumentNotification(brokerId, sharedDoc.name, sharedDoc.category);
          }
        }
      }

      toast({
        title: "Success",
        description: toAdd.length > 0
          ? `Document shared with ${toAdd.length} broker${toAdd.length > 1 ? 's' : ''}. Notifications sent.`
          : "Document sharing updated",
      });

      fetchAllShares();
      setSharingDocId(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update sharing",
        variant: "destructive",
      });
    }
  };

  const toggleBrokerSelection = (brokerId: string) => {
    setSelectedBrokers(prev =>
      prev.includes(brokerId)
        ? prev.filter(id => id !== brokerId)
        : [...prev, brokerId]
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Upload file to storage
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${file.name}`;
      const filePath = `${uploadCategory}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("admin-documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Save metadata to database
      const { error: dbError } = await supabase
        .from("admin_documents")
        .insert({
          name: file.name,
          description: description || null,
          file_path: filePath,
          file_type: fileExt || null,
          file_size: file.size,
          category: uploadCategory,
          uploaded_by: user.id,
        });

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: "Document uploaded successfully",
      });

      setDescription("");
      fetchDocuments();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const { data, error } = await supabase.storage
        .from("admin-documents")
        .download(doc.file_path);

      if (error) throw error;

      // Create download link
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

  const handleDelete = async (doc: Document) => {
    if (!confirm(`Are you sure you want to delete "${doc.name}"?`)) return;

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("admin-documents")
        .remove([doc.file_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from("admin_documents")
        .delete()
        .eq("id", doc.id);

      if (dbError) throw dbError;

      toast({
        title: "Deleted",
        description: "Document deleted successfully",
      });

      fetchDocuments();
    } catch (error: any) {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete document",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (doc: Document) => {
    if (!doc.content_data) {
      toast({
        title: "Not Editable",
        description: "This document was uploaded manually. Only generated documents can be re-edited.",
        variant: "destructive"
      });
      return;
    }

    setEditingDocData(doc.content_data);
    if (doc.category === 'contracts') setShowContractGenerator(true);
    else if (doc.category === 'invoices') setShowInvoiceGenerator(true);
    else if (doc.category === 'proposals' || doc.category === 'templates') setShowProposalGenerator(true);
  };

  const handleView = (doc: Document) => {
    // For documents with content_data, open in editor for viewing/editing
    if (doc.content_data) {
      setEditingDocData(doc.content_data);
      if (doc.category === 'contracts') setShowContractGenerator(true);
      else if (doc.category === 'invoices') setShowInvoiceGenerator(true);
      else if (doc.category === 'proposals' || doc.category === 'templates') setShowProposalGenerator(true);
    } else {
      // For uploaded documents, just download them
      handleDownload(doc);
    }
  };

  const filteredDocuments = selectedCategory === "all"
    ? documents
    : documents.filter((doc) => doc.category === selectedCategory);

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

  // Render Generators
  if (showProposalGenerator) {
    return <ProposalGenerator
      onBack={() => {
        setShowProposalGenerator(false);
        setEditingDocData(null);
      }}
      initialData={editingDocData}
    />;
  }

  if (showInvoiceGenerator) {
    return <InvoiceGenerator
      onBack={() => {
        setShowInvoiceGenerator(false);
        setEditingDocData(null);
      }}
      initialData={editingDocData}
    />;
  }

  if (showContractGenerator) {
    return <ContractGenerator
      onBack={() => {
        setShowContractGenerator(false);
        setEditingDocData(null);
      }}
      initialData={editingDocData}
    />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Documents</h1>
          <p className="text-muted-foreground mt-2">
            Manage templates, contracts, invoices, and other important files
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Upload Card */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Document
            </CardTitle>
            <CardDescription>Add new documents to the library</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={uploadCategory} onValueChange={setUploadCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Input
                placeholder="Brief description of the document"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>File</Label>
              <Input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                disabled={uploading}
                className="cursor-pointer"
              />
            </div>

            {uploading && (
              <p className="text-sm text-muted-foreground">Uploading...</p>
            )}
          </CardContent>
        </Card>

        {/* Quick Access Card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Quick Access Tools
            </CardTitle>
            <CardDescription>Generate documents instantly</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Proposal Generator */}
              <div
                className="flex items-center justify-between p-4 border rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setShowProposalGenerator(true)}
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-pink-500" />
                  <div>
                    <p className="font-medium text-pink-600">Proposal Generator</p>
                    <p className="text-sm text-muted-foreground">Create Pilot Proposals</p>
                  </div>
                </div>
                <Button size="sm" variant="ghost">Create</Button>
              </div>

              {/* Invoice Generator */}
              <div
                className="flex items-center justify-between p-4 border rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setShowInvoiceGenerator(true)}
              >
                <div className="flex items-center gap-3">
                  <Receipt className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="font-medium text-green-600">Invoice Generator</p>
                    <p className="text-sm text-muted-foreground">Create Tax Invoices</p>
                  </div>
                </div>
                <Button size="sm" variant="ghost">Create</Button>
              </div>

              {/* Contract Generator */}
              <div
                className="flex items-center justify-between p-4 border rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setShowContractGenerator(true)}
              >
                <div className="flex items-center gap-3">
                  <FileCheck className="h-8 w-8 text-purple-500" />
                  <div>
                    <p className="font-medium text-purple-600">Contract Generator</p>
                    <p className="text-sm text-muted-foreground">Create SLAs</p>
                  </div>
                </div>
                <Button size="sm" variant="ghost">Create</Button>
              </div>

              {/* Template Downloader */}
              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-8 w-8 text-blue-500" />
                  <div>
                    <p className="font-medium text-blue-600">Lead Template</p>
                    <p className="text-sm text-muted-foreground">CSV Upload Format</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <a href="/templates/lead-upload-template.csv" download>
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Documents List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Document Library
            </CardTitle>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Loading documents...</p>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No documents found</p>
              <p className="text-sm text-muted-foreground mt-1">Upload your first document above</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Shared With</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.map((doc) => (
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
                      {(documentShares[doc.id]?.length || 0) > 0 ? (
                        <Badge variant="secondary" className="gap-1">
                          <Users className="h-3 w-3" />
                          {documentShares[doc.id].length} broker{documentShares[doc.id].length > 1 ? 's' : ''}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not shared</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {format(new Date(doc.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {(doc.category === 'contracts' || doc.category === 'invoices' || doc.category === 'templates' || doc.category === 'proposals') && doc.content_data && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleView(doc)}
                            title="View & Edit document"
                            className="text-purple-500 hover:text-purple-600 hover:bg-purple-500/10"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        {(doc.category === 'contracts' || doc.category === 'invoices' || doc.category === 'templates' || doc.category === 'proposals') && doc.content_data && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(doc)}
                            title="Edit document"
                            className="text-pink-500 hover:text-pink-600 hover:bg-pink-500/10"
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                        )}
                        <Dialog open={sharingDocId === doc.id} onOpenChange={(open) => !open && setSharingDocId(null)}>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openShareDialog(doc.id)}
                            >
                              <Share2 className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Share "{doc.name}"</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <p className="text-sm text-muted-foreground">
                                Select brokers who should have access to this document:
                              </p>
                              <ScrollArea className="h-[300px] border rounded-lg p-4">
                                {brokers.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">No active brokers found</p>
                                ) : (
                                  <div className="space-y-3">
                                    {brokers.map((broker) => (
                                      <div key={broker.id} className="flex items-center space-x-3">
                                        <Checkbox
                                          id={broker.id}
                                          checked={selectedBrokers.includes(broker.id)}
                                          onCheckedChange={() => toggleBrokerSelection(broker.id)}
                                        />
                                        <label htmlFor={broker.id} className="text-sm cursor-pointer flex-1">
                                          <span className="font-medium">{broker.firm_name}</span>
                                          <span className="text-muted-foreground ml-2">({broker.contact_person})</span>
                                        </label>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </ScrollArea>
                              <div className="flex justify-between items-center">
                                <p className="text-sm text-muted-foreground">
                                  {selectedBrokers.length} broker{selectedBrokers.length !== 1 ? 's' : ''} selected
                                </p>
                                <Button onClick={handleShare}>
                                  Save Sharing Settings
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(doc)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(doc)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div >
  );
};

export default AdminDocuments;
