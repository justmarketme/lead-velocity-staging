import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CommunicationAnalytics } from "./CommunicationAnalytics";
import { SLAManagement } from "./SLAManagement";
import { ScheduledReports } from "./ScheduledReports";
import { BarChart3, Clock, Calendar } from "lucide-react";

const Analytics = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold gradient-text">Analytics & Reports</h1>
      
      <Tabs defaultValue="analytics" className="space-y-4">
        <TabsList>
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="sla" className="gap-2">
            <Clock className="h-4 w-4" />
            SLA Management
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="gap-2">
            <Calendar className="h-4 w-4" />
            Scheduled Reports
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="analytics">
          <CommunicationAnalytics />
        </TabsContent>
        
        <TabsContent value="sla">
          <SLAManagement />
        </TabsContent>
        
        <TabsContent value="scheduled">
          <ScheduledReports />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Analytics;
