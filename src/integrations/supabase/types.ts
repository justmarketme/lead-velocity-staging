export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_documents: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          name: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          name: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          name?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      admin_invites: {
        Row: {
          created_at: string | null
          created_by: string
          email: string | null
          expires_at: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          email?: string | null
          expires_at: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          email?: string | null
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      ai_call_requests: {
        Row: {
          admin_notes: string | null
          call_duration: number | null
          call_purpose: string
          call_purpose_details: string | null
          call_recording_url: string | null
          call_sid: string | null
          call_status: string
          call_summary: string | null
          changes_approved: boolean | null
          changes_approved_at: string | null
          changes_approved_by: string | null
          created_at: string
          id: string
          proposed_changes: Json | null
          recipient_id: string
          recipient_name: string
          recipient_phone: string
          recipient_type: string
          requested_by: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          call_duration?: number | null
          call_purpose: string
          call_purpose_details?: string | null
          call_recording_url?: string | null
          call_sid?: string | null
          call_status?: string
          call_summary?: string | null
          changes_approved?: boolean | null
          changes_approved_at?: string | null
          changes_approved_by?: string | null
          created_at?: string
          id?: string
          proposed_changes?: Json | null
          recipient_id: string
          recipient_name: string
          recipient_phone: string
          recipient_type: string
          requested_by: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          call_duration?: number | null
          call_purpose?: string
          call_purpose_details?: string | null
          call_recording_url?: string | null
          call_sid?: string | null
          call_status?: string
          call_summary?: string | null
          changes_approved?: boolean | null
          changes_approved_at?: string | null
          changes_approved_by?: string | null
          created_at?: string
          id?: string
          proposed_changes?: Json | null
          recipient_id?: string
          recipient_name?: string
          recipient_phone?: string
          recipient_type?: string
          requested_by?: string
          updated_at?: string
        }
        Relationships: []
      }
      brokers: {
        Row: {
          contact_person: string
          created_at: string | null
          email: string | null
          firm_name: string
          id: string
          phone_number: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          contact_person: string
          created_at?: string | null
          email?: string | null
          firm_name: string
          id?: string
          phone_number?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          contact_person?: string
          created_at?: string | null
          email?: string | null
          firm_name?: string
          id?: string
          phone_number?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      broker_onboarding_responses: {
        Row: {
          id: string
          broker_id: string | null
          full_name: string | null
          email: string | null
          phone_number: string | null
          firm_name: string | null
          crm_usage: string
          speed_to_contact: string
          team_size: string
          follow_up_process: string
          monthly_lead_spend: string
          cpl_awareness: string
          pricing_comfort: string
          desired_leads_weekly: number
          max_capacity_weekly: number
          product_focus_clarity: string
          geographic_focus_clarity: string
          growth_goal_clarity: string
          timeline_to_start: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          broker_id?: string | null
          full_name?: string | null
          email?: string | null
          phone_number?: string | null
          firm_name?: string | null
          crm_usage: string
          speed_to_contact: string
          team_size: string
          follow_up_process: string
          monthly_lead_spend: string
          cpl_awareness: string
          pricing_comfort: string
          desired_leads_weekly: number
          max_capacity_weekly: number
          product_focus_clarity: string
          geographic_focus_clarity: string
          growth_goal_clarity: string
          timeline_to_start: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          broker_id?: string | null
          full_name?: string | null
          email?: string | null
          phone_number?: string | null
          firm_name?: string | null
          crm_usage?: string
          speed_to_contact?: string
          team_size?: string
          follow_up_process?: string
          monthly_lead_spend?: string
          cpl_awareness?: string
          pricing_comfort?: string
          desired_leads_weekly?: number
          max_capacity_weekly?: number
          product_focus_clarity?: string
          geographic_focus_clarity?: string
          growth_goal_clarity?: string
          timeline_to_start?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      broker_analysis: {
        Row: {
          id: string
          response_id: string | null
          broker_id: string | null
          operational_score: number
          budget_score: number
          growth_score: number
          intent_score: number
          success_probability: number
          risk_flags: string[]
          primary_sales_angle: string
          success_band: string
          ai_explanation: string | null
          status: string | null
          admin_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          response_id?: string | null
          broker_id?: string | null
          operational_score: number
          budget_score: number
          growth_score: number
          intent_score: number
          success_probability: number
          risk_flags?: string[]
          primary_sales_angle: string
          success_band: string
          ai_explanation?: string | null
          status?: string | null
          admin_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          response_id?: string | null
          broker_id?: string | null
          operational_score?: number
          budget_score?: number
          growth_score?: number
          intent_score?: number
          success_probability?: number
          risk_flags?: string[]
          primary_sales_angle?: string
          success_band?: string
          ai_explanation?: string | null
          status?: string | null
          admin_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_analysis_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "broker_onboarding_responses"
            referencedColumns: ["id"]
          },
        ]
      }

      communications: {
        Row: {
          broker_id: string | null
          call_duration: number | null
          call_recording_url: string | null
          channel: string
          content: string | null
          created_at: string
          direction: string
          external_id: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          recipient_contact: string
          recipient_id: string | null
          recipient_type: string
          referral_id: string | null
          responded_to_id: string | null
          response_time_seconds: number | null
          sender_id: string | null
          sender_type: string
          status: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          broker_id?: string | null
          call_duration?: number | null
          call_recording_url?: string | null
          channel: string
          content?: string | null
          created_at?: string
          direction: string
          external_id?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          recipient_contact: string
          recipient_id?: string | null
          recipient_type: string
          referral_id?: string | null
          responded_to_id?: string | null
          response_time_seconds?: number | null
          sender_id?: string | null
          sender_type: string
          status?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          broker_id?: string | null
          call_duration?: number | null
          call_recording_url?: string | null
          channel?: string
          content?: string | null
          created_at?: string
          direction?: string
          external_id?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          recipient_contact?: string
          recipient_id?: string | null
          recipient_type?: string
          referral_id?: string | null
          responded_to_id?: string | null
          response_time_seconds?: number | null
          sender_id?: string | null
          sender_type?: string
          status?: string | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communications_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_responded_to_id_fkey"
            columns: ["responded_to_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
        ]
      }
      document_shares: {
        Row: {
          broker_id: string
          document_id: string
          id: string
          shared_at: string
          shared_by: string
        }
        Insert: {
          broker_id: string
          document_id: string
          id?: string
          shared_at?: string
          shared_by: string
        }
        Update: {
          broker_id?: string
          document_id?: string
          id?: string
          shared_at?: string
          shared_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_shares_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_shares_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "admin_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          activity_type: string
          agent_id: string
          created_at: string | null
          id: string
          lead_id: string
          notes: string | null
        }
        Insert: {
          activity_type: string
          agent_id: string
          created_at?: string | null
          id?: string
          lead_id: string
          notes?: string | null
        }
        Update: {
          activity_type?: string
          agent_id?: string
          created_at?: string | null
          id?: string
          lead_id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_conversations: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          message: string
          read_at: string | null
          read_by: string | null
          sender_role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          message: string
          read_at?: string | null
          read_by?: string | null
          sender_role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          message?: string
          read_at?: string | null
          read_by?: string | null
          sender_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          broker_id: string | null
          created_at: string | null
          current_status: string | null
          date_uploaded: string | null
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          notes: string | null
          phone: string
          source: string | null
          updated_at: string | null
        }
        Insert: {
          broker_id?: string | null
          created_at?: string | null
          current_status?: string | null
          date_uploaded?: string | null
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          phone: string
          source?: string | null
          updated_at?: string | null
        }
        Update: {
          broker_id?: string | null
          created_at?: string | null
          current_status?: string | null
          date_uploaded?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string
          source?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          category: string
          channel: string
          content: string
          created_at: string
          created_by: string
          id: string
          name: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          channel: string
          content: string
          created_at?: string
          created_by: string
          id?: string
          name: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          channel?: string
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          ai_call_email: boolean
          ai_call_in_app: boolean
          ai_call_sound: boolean
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_call_email?: boolean
          ai_call_in_app?: boolean
          ai_call_sound?: boolean
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_call_email?: boolean
          ai_call_in_app?: boolean
          ai_call_sound?: boolean
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          appointment_date: string | null
          broker_appointment_scheduled: boolean | null
          created_at: string | null
          first_name: string
          id: string
          parent_lead_id: string
          phone_number: string
          updated_at: string | null
          will_status: string | null
        }
        Insert: {
          appointment_date?: string | null
          broker_appointment_scheduled?: boolean | null
          created_at?: string | null
          first_name: string
          id?: string
          parent_lead_id: string
          phone_number: string
          updated_at?: string | null
          will_status?: string | null
        }
        Update: {
          appointment_date?: string | null
          broker_appointment_scheduled?: boolean | null
          created_at?: string | null
          first_name?: string
          id?: string
          parent_lead_id?: string
          phone_number?: string
          updated_at?: string | null
          will_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_parent_lead_id_fkey"
            columns: ["parent_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      report_history: {
        Row: {
          error_message: string | null
          id: string
          recipients: string[]
          report_data: Json | null
          scheduled_report_id: string | null
          sent_at: string
          status: string
        }
        Insert: {
          error_message?: string | null
          id?: string
          recipients: string[]
          report_data?: Json | null
          scheduled_report_id?: string | null
          sent_at?: string
          status: string
        }
        Update: {
          error_message?: string | null
          id?: string
          recipients?: string[]
          report_data?: Json | null
          scheduled_report_id?: string | null
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_history_scheduled_report_id_fkey"
            columns: ["scheduled_report_id"]
            isOneToOne: false
            referencedRelation: "scheduled_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_reports: {
        Row: {
          broker_id: string | null
          created_at: string
          created_by: string | null
          day_of_month: number | null
          day_of_week: number | null
          enabled: boolean
          frequency: string
          id: string
          include_sections: string[] | null
          last_sent_at: string | null
          name: string
          next_scheduled_at: string | null
          recipient_ids: string[] | null
          recipient_type: string
          report_type: string
          time_of_day: string
          updated_at: string
        }
        Insert: {
          broker_id?: string | null
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          enabled?: boolean
          frequency: string
          id?: string
          include_sections?: string[] | null
          last_sent_at?: string | null
          name: string
          next_scheduled_at?: string | null
          recipient_ids?: string[] | null
          recipient_type: string
          report_type: string
          time_of_day?: string
          updated_at?: string
        }
        Update: {
          broker_id?: string | null
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          enabled?: boolean
          frequency?: string
          id?: string
          include_sections?: string[] | null
          last_sent_at?: string | null
          name?: string
          next_scheduled_at?: string | null
          recipient_ids?: string[] | null
          recipient_type?: string
          report_type?: string
          time_of_day?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_reports_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          channel: string
          communication_id: string | null
          created_at: string
          id: string
          recipient_id: string | null
          recipient_type: string
          response_time_seconds: number
          severity: string
          threshold_seconds: number
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          channel: string
          communication_id?: string | null
          created_at?: string
          id?: string
          recipient_id?: string | null
          recipient_type: string
          response_time_seconds: number
          severity: string
          threshold_seconds: number
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          channel?: string
          communication_id?: string | null
          created_at?: string
          id?: string
          recipient_id?: string | null
          recipient_type?: string
          response_time_seconds?: number
          severity?: string
          threshold_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "sla_alerts_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_thresholds: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          critical_seconds: number
          enabled: boolean
          id: string
          updated_at: string
          warning_seconds: number
        }
        Insert: {
          channel: string
          created_at?: string
          created_by?: string | null
          critical_seconds?: number
          enabled?: boolean
          id?: string
          updated_at?: string
          warning_seconds?: number
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          critical_seconds?: number
          enabled?: boolean
          id?: string
          updated_at?: string
          warning_seconds?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_next_schedule: {
        Args: {
          p_day_of_month: number
          p_day_of_week: number
          p_frequency: string
          p_time_of_day: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      use_admin_invite: {
        Args: { invite_token: string; new_user_id: string }
        Returns: boolean
      }
      validate_admin_invite: {
        Args: { invite_token: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "broker"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
  | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
  ? R
  : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
    DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] &
    DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
  ? R
  : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema["Tables"]
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Insert: infer I
  }
  ? I
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Insert: infer I
  }
  ? I
  : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema["Tables"]
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Update: infer U
  }
  ? U
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Update: infer U
  }
  ? U
  : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
  | keyof DefaultSchema["Enums"]
  | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
  : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
  | keyof DefaultSchema["CompositeTypes"]
  | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
  : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "broker"],
    },
  },
} as const
