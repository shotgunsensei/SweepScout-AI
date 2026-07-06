export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          message: string;
          metadata: Json;
          severity: "info" | "warn" | "block";
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          message?: string;
          metadata?: Json;
          severity?: "info" | "warn" | "block";
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          message?: string;
          metadata?: Json;
          severity?: "info" | "warn" | "block";
        };
        Relationships: [];
      };
      blocked_domains: {
        Row: {
          created_at: string;
          domain: string;
          id: string;
          reason: string;
        };
        Insert: {
          created_at?: string;
          domain: string;
          id?: string;
          reason?: string;
        };
        Update: {
          created_at?: string;
          domain?: string;
          id?: string;
          reason?: string;
        };
        Relationships: [];
      };
      discovery_jobs: {
        Row: {
          completed_at: string | null;
          created_at: string;
          errors: Json;
          id: string;
          query: string;
          results_found: number;
          status: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          errors?: Json;
          id?: string;
          query: string;
          results_found?: number;
          status?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          errors?: Json;
          id?: string;
          query?: string;
          results_found?: number;
          status?: string;
        };
        Relationships: [];
      };
      entry_attempts: {
        Row: {
          created_at: string;
          id: string;
          notes: string | null;
          screenshot_path: string | null;
          status: Database["public"]["Enums"]["entry_attempt_status"];
          submitted_at: string | null;
          sweepstakes_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          notes?: string | null;
          screenshot_path?: string | null;
          status?: Database["public"]["Enums"]["entry_attempt_status"];
          submitted_at?: string | null;
          sweepstakes_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          notes?: string | null;
          screenshot_path?: string | null;
          status?: Database["public"]["Enums"]["entry_attempt_status"];
          submitted_at?: string | null;
          sweepstakes_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entry_attempts_sweepstakes_id_fkey";
            columns: ["sweepstakes_id"];
            isOneToOne: false;
            referencedRelation: "sweepstakes";
            referencedColumns: ["id"];
          },
        ];
      };
      extraction_jobs: {
        Row: {
          created_at: string;
          error: string | null;
          finished_at: string | null;
          id: string;
          model: string | null;
          started_at: string | null;
          status: string;
          summary: string | null;
          sweepstakes_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id: string;
          model?: string | null;
          started_at?: string | null;
          status?: string;
          summary?: string | null;
          sweepstakes_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          model?: string | null;
          started_at?: string | null;
          status?: string;
          summary?: string | null;
          sweepstakes_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "extraction_jobs_sweepstakes_id_fkey";
            columns: ["sweepstakes_id"];
            isOneToOne: false;
            referencedRelation: "sweepstakes";
            referencedColumns: ["id"];
          },
        ];
      };
      sweepstakes: {
        Row: {
          canonical_url: string | null;
          compliance_notes: string[];
          created_at: string;
          deadline: string | null;
          eligible_states: string[];
          eligibility_text: string | null;
          entry_frequency: string | null;
          estimated_value: number | null;
          extracted_json: Json;
          form_url: string | null;
          id: string;
          minimum_age: number | null;
          no_purchase_method_found: boolean;
          official_rules_url: string | null;
          prize_summary: string | null;
          purchase_required: boolean;
          scam_score: number;
          source_url: string;
          sponsor: string | null;
          status: Database["public"]["Enums"]["sweepstakes_status"];
          title: string;
          updated_at: string;
        };
        Insert: {
          canonical_url?: string | null;
          compliance_notes?: string[];
          created_at?: string;
          deadline?: string | null;
          eligible_states?: string[];
          eligibility_text?: string | null;
          entry_frequency?: string | null;
          estimated_value?: number | null;
          extracted_json?: Json;
          form_url?: string | null;
          id?: string;
          minimum_age?: number | null;
          no_purchase_method_found?: boolean;
          official_rules_url?: string | null;
          prize_summary?: string | null;
          purchase_required?: boolean;
          scam_score?: number;
          source_url: string;
          sponsor?: string | null;
          status?: Database["public"]["Enums"]["sweepstakes_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          canonical_url?: string | null;
          compliance_notes?: string[];
          created_at?: string;
          deadline?: string | null;
          eligible_states?: string[];
          eligibility_text?: string | null;
          entry_frequency?: string | null;
          estimated_value?: number | null;
          extracted_json?: Json;
          form_url?: string | null;
          id?: string;
          minimum_age?: number | null;
          no_purchase_method_found?: boolean;
          official_rules_url?: string | null;
          prize_summary?: string | null;
          purchase_required?: boolean;
          scam_score?: number;
          source_url?: string;
          sponsor?: string | null;
          status?: Database["public"]["Enums"]["sweepstakes_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      users_profile: {
        Row: {
          address_line1: string | null;
          address_line2: string | null;
          alternate_email: string | null;
          city: string | null;
          consent_to_prefill: boolean;
          country: string;
          created_at: string;
          date_of_birth: string | null;
          email: string;
          first_name: string;
          id: string;
          last_name: string;
          phone: string | null;
          postal_code: string | null;
          state: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          address_line1?: string | null;
          address_line2?: string | null;
          alternate_email?: string | null;
          city?: string | null;
          consent_to_prefill?: boolean;
          country?: string;
          created_at?: string;
          date_of_birth?: string | null;
          email: string;
          first_name?: string;
          id?: string;
          last_name?: string;
          phone?: string | null;
          postal_code?: string | null;
          state?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          address_line1?: string | null;
          address_line2?: string | null;
          alternate_email?: string | null;
          city?: string | null;
          consent_to_prefill?: boolean;
          country?: string;
          created_at?: string;
          date_of_birth?: string | null;
          email?: string;
          first_name?: string;
          id?: string;
          last_name?: string;
          phone?: string | null;
          postal_code?: string | null;
          state?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      entry_attempt_status:
        | "queued"
        | "prefilled"
        | "submitted_by_user"
        | "skipped"
        | "suspicious"
        | "winner_notification"
        | "expired"
        | "failed";
      sweepstakes_status: "discovered" | "reviewed" | "eligible" | "ineligible" | "suspicious" | "expired";
    };
    CompositeTypes: Record<string, never>;
  };
};
