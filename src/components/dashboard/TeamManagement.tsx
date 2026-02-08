import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

const TeamManagement = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold gradient-text">Team Management</h1>

      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>Manage your team and assign leads</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center min-h-[300px]">
          <Users className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Team management features coming soon</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamManagement;
