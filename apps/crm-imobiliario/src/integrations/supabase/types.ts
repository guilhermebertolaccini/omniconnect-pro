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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      change_history: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          field: string
          id: string
          new_value: string | null
          old_value: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          broker_id: string | null
          cpf_cnpj: string | null
          created_at: string
          email: string | null
          id: string
          income: number | null
          name: string
          notes: string | null
          phone: string | null
          score: Database["public"]["Enums"]["client_score"] | null
          updated_at: string
        }
        Insert: {
          broker_id?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          income?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          score?: Database["public"]["Enums"]["client_score"] | null
          updated_at?: string
        }
        Update: {
          broker_id?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          income?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          score?: Database["public"]["Enums"]["client_score"] | null
          updated_at?: string
        }
        Relationships: []
      }
      commission_configs: {
        Row: {
          commission_percent: number
          property_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          commission_percent?: number
          property_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          commission_percent?: number
          property_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      commissions: {
        Row: {
          broker_id: string
          broker_name: string | null
          commission_percent: number
          commission_value: number
          contract_id: string
          created_at: string
          id: string
          paid_at: string | null
          property_id: string
          property_name: string
          sale_price: number
          status: Database["public"]["Enums"]["commission_status"]
          unit_id: string
          unit_number: string
          updated_at: string
        }
        Insert: {
          broker_id: string
          broker_name?: string | null
          commission_percent?: number
          commission_value?: number
          contract_id: string
          created_at?: string
          id?: string
          paid_at?: string | null
          property_id: string
          property_name: string
          sale_price?: number
          status?: Database["public"]["Enums"]["commission_status"]
          unit_id: string
          unit_number: string
          updated_at?: string
        }
        Update: {
          broker_id?: string
          broker_name?: string | null
          commission_percent?: number
          commission_value?: number
          contract_id?: string
          created_at?: string
          id?: string
          paid_at?: string | null
          property_id?: string
          property_name?: string
          sale_price?: number
          status?: Database["public"]["Enums"]["commission_status"]
          unit_id?: string
          unit_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      contract_events: {
        Row: {
          contract_id: string
          created_at: string
          created_by: string | null
          event_type: string
          from_status: string | null
          id: string
          message: string | null
          to_status: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by?: string | null
          event_type: string
          from_status?: string | null
          id?: string
          message?: string | null
          to_status?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by?: string | null
          event_type?: string
          from_status?: string | null
          id?: string
          message?: string | null
          to_status?: string | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          broker_id: string
          broker_name: string | null
          client_cpf_cnpj: string | null
          client_id: string
          client_name: string
          created_at: string
          external_envelope_id: string | null
          external_envelope_url: string | null
          external_provider: string | null
          final_price: number
          id: string
          notes: string | null
          payment_condition: Json
          pdf_url: string | null
          property_id: string
          property_name: string
          proposal_id: string | null
          signatures: Json
          source_pdf_url: string | null
          status: Database["public"]["Enums"]["contract_status"]
          unit_id: string
          unit_number: string
          updated_at: string
        }
        Insert: {
          broker_id: string
          broker_name?: string | null
          client_cpf_cnpj?: string | null
          client_id: string
          client_name: string
          created_at?: string
          external_envelope_id?: string | null
          external_envelope_url?: string | null
          external_provider?: string | null
          final_price?: number
          id?: string
          notes?: string | null
          payment_condition?: Json
          pdf_url?: string | null
          property_id: string
          property_name: string
          proposal_id?: string | null
          signatures?: Json
          source_pdf_url?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          unit_id: string
          unit_number: string
          updated_at?: string
        }
        Update: {
          broker_id?: string
          broker_name?: string | null
          client_cpf_cnpj?: string | null
          client_id?: string
          client_name?: string
          created_at?: string
          external_envelope_id?: string | null
          external_envelope_url?: string | null
          external_provider?: string | null
          final_price?: number
          id?: string
          notes?: string | null
          payment_condition?: Json
          pdf_url?: string | null
          property_id?: string
          property_name?: string
          proposal_id?: string | null
          signatures?: Json
          source_pdf_url?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          unit_id?: string
          unit_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_access_log: {
        Row: {
          action: string
          created_at: string
          id: string
          parent_id: string
          parent_type: string
          pdf_url: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          parent_id: string
          parent_type: string
          pdf_url: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          parent_id?: string
          parent_type?: string
          pdf_url?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      document_versions: {
        Row: {
          action: string
          created_at: string
          file_name: string | null
          id: string
          parent_id: string
          parent_type: string
          pdf_url: string
          uploaded_by: string | null
          uploader_name: string | null
        }
        Insert: {
          action?: string
          created_at?: string
          file_name?: string | null
          id?: string
          parent_id: string
          parent_type: string
          pdf_url: string
          uploaded_by?: string | null
          uploader_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          file_name?: string | null
          id?: string
          parent_id?: string
          parent_type?: string
          pdf_url?: string
          uploaded_by?: string | null
          uploader_name?: string | null
        }
        Relationships: []
      }
      follow_ups: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          notes: string | null
          scheduled_at: string
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          notes?: string | null
          scheduled_at: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          notes?: string | null
          scheduled_at?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      frontend_logs: {
        Row: {
          client_timestamp: string | null
          created_at: string
          id: string
          level: string
          message: string
          metadata: Json | null
          page: string | null
          session_id: string | null
          source: string | null
          stack: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          client_timestamp?: string | null
          created_at?: string
          id?: string
          level: string
          message: string
          metadata?: Json | null
          page?: string | null
          session_id?: string | null
          source?: string | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          client_timestamp?: string | null
          created_at?: string
          id?: string
          level?: string
          message?: string
          metadata?: Json | null
          page?: string | null
          session_id?: string | null
          source?: string | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      interactions: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          type: Database["public"]["Enums"]["interaction_type"]
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          type: Database["public"]["Enums"]["interaction_type"]
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          type?: Database["public"]["Enums"]["interaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "interactions_lead_id_fkey"
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
          broker_name: string | null
          client_id: string | null
          created_at: string
          email: string | null
          estimated_value: number | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          property_id: string | null
          property_interest: string | null
          source: string | null
          stage: Database["public"]["Enums"]["lead_stage"]
          updated_at: string
        }
        Insert: {
          broker_id?: string | null
          broker_name?: string | null
          client_id?: string | null
          created_at?: string
          email?: string | null
          estimated_value?: number | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          property_id?: string | null
          property_interest?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
        }
        Update: {
          broker_id?: string | null
          broker_name?: string | null
          client_id?: string | null
          created_at?: string
          email?: string | null
          estimated_value?: number | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          property_id?: string | null
          property_interest?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          commission_paid: boolean
          contract_pending_signature: boolean
          created_at: string
          payment_due_soon: boolean
          payment_overdue: boolean
          proposal_sent: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          commission_paid?: boolean
          contract_pending_signature?: boolean
          created_at?: string
          payment_due_soon?: boolean
          payment_overdue?: boolean
          proposal_sent?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          commission_paid?: boolean
          contract_pending_signature?: boolean
          created_at?: string
          payment_due_soon?: boolean
          payment_overdue?: boolean
          proposal_sent?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          client_id: string
          client_name: string
          contract_id: string
          created_at: string
          due_date: string
          id: string
          installment_number: number | null
          paid_at: string | null
          property_id: string
          property_name: string
          status: Database["public"]["Enums"]["payment_status"]
          type: Database["public"]["Enums"]["payment_type"]
          unit_id: string
          unit_number: string
          updated_at: string
        }
        Insert: {
          amount?: number
          client_id: string
          client_name: string
          contract_id: string
          created_at?: string
          due_date: string
          id?: string
          installment_number?: number | null
          paid_at?: string | null
          property_id: string
          property_name: string
          status?: Database["public"]["Enums"]["payment_status"]
          type: Database["public"]["Enums"]["payment_type"]
          unit_id: string
          unit_number: string
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string
          client_name?: string
          contract_id?: string
          created_at?: string
          due_date?: string
          id?: string
          installment_number?: number | null
          paid_at?: string | null
          property_id?: string
          property_name?: string
          status?: Database["public"]["Enums"]["payment_status"]
          type?: Database["public"]["Enums"]["payment_type"]
          unit_id?: string
          unit_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string
          city: string
          created_at: string
          created_by: string | null
          developer: string | null
          documents: Json | null
          id: string
          image_url: string | null
          name: string
          towers: Json | null
          updated_at: string
        }
        Insert: {
          address: string
          city: string
          created_at?: string
          created_by?: string | null
          developer?: string | null
          documents?: Json | null
          id?: string
          image_url?: string | null
          name: string
          towers?: Json | null
          updated_at?: string
        }
        Update: {
          address?: string
          city?: string
          created_at?: string
          created_by?: string | null
          developer?: string | null
          documents?: Json | null
          id?: string
          image_url?: string | null
          name?: string
          towers?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      proposal_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          from_status: string | null
          id: string
          message: string | null
          proposal_id: string
          to_status: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          from_status?: string | null
          id?: string
          message?: string | null
          proposal_id: string
          to_status?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          from_status?: string | null
          id?: string
          message?: string | null
          proposal_id?: string
          to_status?: string | null
        }
        Relationships: []
      }
      proposals: {
        Row: {
          broker_id: string
          broker_name: string | null
          client_id: string
          client_name: string
          created_at: string
          discount: number
          discount_percent: number
          final_price: number
          id: string
          notes: string | null
          original_price: number
          payment_condition: Json
          pdf_url: string | null
          property_id: string
          property_name: string
          source_pdf_url: string | null
          status: Database["public"]["Enums"]["proposal_status"]
          unit_id: string
          unit_number: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          broker_id: string
          broker_name?: string | null
          client_id: string
          client_name: string
          created_at?: string
          discount?: number
          discount_percent?: number
          final_price?: number
          id?: string
          notes?: string | null
          original_price?: number
          payment_condition?: Json
          pdf_url?: string | null
          property_id: string
          property_name: string
          source_pdf_url?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          unit_id: string
          unit_number: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          broker_id?: string
          broker_name?: string | null
          client_id?: string
          client_name?: string
          created_at?: string
          discount?: number
          discount_percent?: number
          final_price?: number
          id?: string
          notes?: string | null
          original_price?: number
          payment_condition?: Json
          pdf_url?: string | null
          property_id?: string
          property_name?: string
          source_pdf_url?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          unit_id?: string
          unit_number?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      signatures: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          ip_address: string | null
          role: string
          signature_hash: string | null
          signed_at: string | null
          signer_email: string | null
          signer_name: string | null
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          role: string
          signature_hash?: string | null
          signed_at?: string | null
          signer_email?: string | null
          signer_name?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          role?: string
          signature_hash?: string | null
          signed_at?: string | null
          signer_email?: string | null
          signer_name?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      units: {
        Row: {
          area: number | null
          client_id: string | null
          contract_id: string | null
          created_at: string
          floor: number | null
          id: string
          number: string
          observations: string | null
          price: number
          property_id: string
          proposal_id: string | null
          reservation_expiry: string | null
          reserved_at: string | null
          status: Database["public"]["Enums"]["unit_status"]
          tower: string | null
          typology: string | null
          updated_at: string
        }
        Insert: {
          area?: number | null
          client_id?: string | null
          contract_id?: string | null
          created_at?: string
          floor?: number | null
          id?: string
          number: string
          observations?: string | null
          price?: number
          property_id: string
          proposal_id?: string | null
          reservation_expiry?: string | null
          reserved_at?: string | null
          status?: Database["public"]["Enums"]["unit_status"]
          tower?: string | null
          typology?: string | null
          updated_at?: string
        }
        Update: {
          area?: number | null
          client_id?: string | null
          contract_id?: string | null
          created_at?: string
          floor?: number | null
          id?: string
          number?: string
          observations?: string | null
          price?: number
          property_id?: string
          proposal_id?: string | null
          reservation_expiry?: string | null
          reserved_at?: string | null
          status?: Database["public"]["Enums"]["unit_status"]
          tower?: string | null
          typology?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      audit_current_user_name: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_field_change: {
        Args: {
          _entity_id: string
          _entity_type: string
          _field: string
          _new: string
          _old: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "broker"
      client_score: "A" | "B" | "C" | "D"
      commission_status: "pending" | "paid"
      contract_status: "draft" | "review" | "pending_signature" | "signed"
      interaction_type:
        | "call"
        | "email"
        | "whatsapp"
        | "meeting"
        | "note"
        | "visit"
      lead_stage:
        | "new"
        | "contacted"
        | "qualified"
        | "proposal"
        | "negotiation"
        | "won"
        | "lost"
        | "visit"
        | "closed_won"
        | "closed_lost"
      payment_status: "pending" | "paid" | "overdue"
      payment_type: "signal" | "installment" | "balloon"
      proposal_status: "draft" | "sent" | "accepted" | "rejected"
      unit_status: "available" | "reserved" | "sold"
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
      app_role: ["admin", "manager", "broker"],
      client_score: ["A", "B", "C", "D"],
      commission_status: ["pending", "paid"],
      contract_status: ["draft", "review", "pending_signature", "signed"],
      interaction_type: [
        "call",
        "email",
        "whatsapp",
        "meeting",
        "note",
        "visit",
      ],
      lead_stage: [
        "new",
        "contacted",
        "qualified",
        "proposal",
        "negotiation",
        "won",
        "lost",
        "visit",
        "closed_won",
        "closed_lost",
      ],
      payment_status: ["pending", "paid", "overdue"],
      payment_type: ["signal", "installment", "balloon"],
      proposal_status: ["draft", "sent", "accepted", "rejected"],
      unit_status: ["available", "reserved", "sold"],
    },
  },
} as const
