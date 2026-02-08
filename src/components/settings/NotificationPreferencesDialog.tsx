import { Settings, Mail, Bell, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useNotificationPreferences } from "@/hooks/use-notification-preferences";
import { Skeleton } from "@/components/ui/skeleton";

interface NotificationPreferencesDialogProps {
  trigger?: React.ReactNode;
}

export function NotificationPreferencesDialog({ trigger }: NotificationPreferencesDialogProps) {
  const { preferences, loading, saving, updatePreferences } = useNotificationPreferences();

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Notification Preferences</DialogTitle>
          <DialogDescription>
            Choose how you want to receive AI call notifications
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">AI Call Notifications</h4>
            
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label htmlFor="email-notifications" className="font-medium">
                        Email Notifications
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Receive emails when AI calls complete with changes
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="email-notifications"
                    checked={preferences.ai_call_email}
                    onCheckedChange={(checked) => updatePreferences({ ai_call_email: checked })}
                    disabled={saving}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label htmlFor="in-app-notifications" className="font-medium">
                        In-App Notifications
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Show notifications in the notification bell
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="in-app-notifications"
                    checked={preferences.ai_call_in_app}
                    onCheckedChange={(checked) => updatePreferences({ ai_call_in_app: checked })}
                    disabled={saving}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <Volume2 className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label htmlFor="sound-notifications" className="font-medium">
                        Sound Alerts
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Play a sound when new notifications arrive
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="sound-notifications"
                    checked={preferences.ai_call_sound}
                    onCheckedChange={(checked) => updatePreferences({ ai_call_sound: checked })}
                    disabled={saving}
                  />
                </div>
              </>
            )}
          </div>

          <Separator />

          <p className="text-xs text-muted-foreground">
            Changes are saved automatically. At least one notification method is recommended.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
