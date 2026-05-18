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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agencies: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string | null
          plan: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id?: string | null
          plan?: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string | null
          plan?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      agency_invitations: {
        Row: {
          accepted_at: string | null
          agency_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["agency_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          agency_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["agency_role"]
          token: string
        }
        Update: {
          accepted_at?: string | null
          agency_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["agency_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_invitations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_members: {
        Row: {
          agency_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["agency_role"]
          user_id: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["agency_role"]
          user_id: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["agency_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_members_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_campaign_analyses: {
        Row: {
          agency_id: string
          analysis: Json
          campaign_id: string
          campaign_name: string | null
          company_id: string
          created_at: string
          generated_by: string | null
          id: string
          platform: Database["public"]["Enums"]["ad_platform"]
        }
        Insert: {
          agency_id: string
          analysis: Json
          campaign_id: string
          campaign_name?: string | null
          company_id: string
          created_at?: string
          generated_by?: string | null
          id?: string
          platform?: Database["public"]["Enums"]["ad_platform"]
        }
        Update: {
          agency_id?: string
          analysis?: Json
          campaign_id?: string
          campaign_name?: string | null
          company_id?: string
          created_at?: string
          generated_by?: string | null
          id?: string
          platform?: Database["public"]["Enums"]["ad_platform"]
        }
        Relationships: [
          {
            foreignKeyName: "ai_campaign_analyses_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          agency_id: string
          category: string
          company_id: string | null
          created_at: string
          id: string
          message: string
          metadata: Json
          platform: Database["public"]["Enums"]["ad_platform"] | null
          severity: string
        }
        Insert: {
          action: string
          actor_type?: string
          actor_user_id?: string | null
          agency_id: string
          category: string
          company_id?: string | null
          created_at?: string
          id?: string
          message: string
          metadata?: Json
          platform?: Database["public"]["Enums"]["ad_platform"] | null
          severity?: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          agency_id?: string
          category?: string
          company_id?: string | null
          created_at?: string
          id?: string
          message?: string
          metadata?: Json
          platform?: Database["public"]["Enums"]["ad_platform"] | null
          severity?: string
        }
        Relationships: []
      }
      client_company_access: {
        Row: {
          company_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_company_access_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          active_campaigns: number
          agency_id: string
          business_name: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          last_sync: string | null
          meta_business_id: string | null
          name: string
          status: string
          timezone: string
          total_spent: number
          updated_at: string
        }
        Insert: {
          active_campaigns?: number
          agency_id?: string
          business_name: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          last_sync?: string | null
          meta_business_id?: string | null
          name: string
          status?: string
          timezone?: string
          total_spent?: number
          updated_at?: string
        }
        Update: {
          active_campaigns?: number
          agency_id?: string
          business_name?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          last_sync?: string | null
          meta_business_id?: string | null
          name?: string
          status?: string
          timezone?: string
          total_spent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_configurations: {
        Row: {
          access_token: string
          ad_account_id: string | null
          agency_id: string
          app_id: string | null
          app_secret: string | null
          company_id: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          meta_business_id: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          ad_account_id?: string | null
          agency_id: string
          app_id?: string | null
          app_secret?: string | null
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          meta_business_id?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          ad_account_id?: string | null
          agency_id?: string
          app_id?: string | null
          app_secret?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          meta_business_id?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_configurations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_configurations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      organic_post_experiment_variants: {
        Row: {
          caption: string | null
          created_at: string
          experiment_id: string
          id: string
          label: string
          media_url: string | null
          metrics_snapshot: Json | null
          note: string | null
          platform: string | null
          post_id: string | null
          post_type: string | null
          scheduled_for: string | null
          updated_at: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          experiment_id: string
          id?: string
          label: string
          media_url?: string | null
          metrics_snapshot?: Json | null
          note?: string | null
          platform?: string | null
          post_id?: string | null
          post_type?: string | null
          scheduled_for?: string | null
          updated_at?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          experiment_id?: string
          id?: string
          label?: string
          media_url?: string | null
          metrics_snapshot?: Json | null
          note?: string | null
          platform?: string | null
          post_id?: string | null
          post_type?: string | null
          scheduled_for?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organic_post_experiment_variants_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "organic_post_experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      organic_post_experiments: {
        Row: {
          account_id: string | null
          agency_id: string
          ai_summary: Json | null
          company_id: string
          created_at: string
          created_by: string | null
          duration_days: number
          ends_at: string | null
          hypothesis: string | null
          id: string
          min_sample_reach: number
          mode: string
          name: string
          platform: Database["public"]["Enums"]["ad_platform"]
          started_at: string | null
          status: string
          updated_at: string
          winner_variant_id: string | null
          winning_metric: string
        }
        Insert: {
          account_id?: string | null
          agency_id: string
          ai_summary?: Json | null
          company_id: string
          created_at?: string
          created_by?: string | null
          duration_days?: number
          ends_at?: string | null
          hypothesis?: string | null
          id?: string
          min_sample_reach?: number
          mode: string
          name: string
          platform?: Database["public"]["Enums"]["ad_platform"]
          started_at?: string | null
          status?: string
          updated_at?: string
          winner_variant_id?: string | null
          winning_metric?: string
        }
        Update: {
          account_id?: string | null
          agency_id?: string
          ai_summary?: Json | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          duration_days?: number
          ends_at?: string | null
          hypothesis?: string | null
          id?: string
          min_sample_reach?: number
          mode?: string
          name?: string
          platform?: Database["public"]["Enums"]["ad_platform"]
          started_at?: string | null
          status?: string
          updated_at?: string
          winner_variant_id?: string | null
          winning_metric?: string
        }
        Relationships: []
      }
      platform_configurations: {
        Row: {
          access_token: string | null
          account_id: string | null
          agency_id: string
          company_id: string
          created_at: string
          created_by: string
          extra: Json
          id: string
          is_active: boolean
          platform: Database["public"]["Enums"]["ad_platform"]
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          agency_id: string
          company_id: string
          created_at?: string
          created_by: string
          extra?: Json
          id?: string
          is_active?: boolean
          platform: Database["public"]["Enums"]["ad_platform"]
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          agency_id?: string
          company_id?: string
          created_at?: string
          created_by?: string
          extra?: Json
          id?: string
          is_active?: boolean
          platform?: Database["public"]["Enums"]["ad_platform"]
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_configurations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      company_in_user_agencies: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      get_user_agency_ids: { Args: { _user_id: string }; Returns: string[] }
      has_agency_role: {
        Args: {
          _agency_id: string
          _role: Database["public"]["Enums"]["agency_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_agency_member: {
        Args: { _agency_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      ad_platform: "meta" | "google_ads" | "tiktok_ads"
      agency_role: "owner" | "admin" | "operator"
      app_role: "admin" | "moderator" | "user" | "super_admin"
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
      ad_platform: ["meta", "google_ads", "tiktok_ads"],
      agency_role: ["owner", "admin", "operator"],
      app_role: ["admin", "moderator", "user", "super_admin"],
    },
  },
} as const
