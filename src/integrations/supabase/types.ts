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
      admin_notifications: {
        Row: {
          id: string
          type: string
          title: string
          message: string
          is_read: boolean
          batch_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          type: string
          title: string
          message: string
          is_read?: boolean
          batch_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          type?: string
          title?: string
          message?: string
          is_read?: boolean
          batch_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "production_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_phase_rates: {
        Row: {
          id: string
          batch_id: string
          phase_id: string
          rate_per_piece: number
          quantity_locked: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          batch_id: string
          phase_id: string
          rate_per_piece?: number
          quantity_locked?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          batch_id?: string
          phase_id?: string
          rate_per_piece?: number
          quantity_locked?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_phase_rates_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "production_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_phase_rates_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "production_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_tracking: {
        Row: {
          id: string
          batch_id: string
          phase_id: string
          worker_id: string
          quantity_completed: number
          quantity_wasted: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          batch_id: string
          phase_id: string
          worker_id: string
          quantity_completed?: number
          quantity_wasted?: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          batch_id?: string
          phase_id?: string
          worker_id?: string
          quantity_completed?: number
          quantity_wasted?: number
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_tracking_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "production_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_tracking_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "production_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          quantity_on_hand: number
          reorder_level: number
          sku: string
          unit: string
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          quantity_on_hand?: number
          reorder_level?: number
          sku: string
          unit?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          quantity_on_hand?: number
          reorder_level?: number
          sku?: string
          unit?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          created_at: string
          id: string
          item_id: string
          performed_by: string | null
          quantity: number
          reason: string | null
          type: Database["public"]["Enums"]["movement_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          performed_by?: string | null
          quantity: number
          reason?: string | null
          type: Database["public"]["Enums"]["movement_type"]
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          performed_by?: string | null
          quantity?: number
          reason?: string | null
          type?: Database["public"]["Enums"]["movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_updates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_updates_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          client_id: string
          created_at: string
          currency: string | null
          expected_delivery: string | null
          id: string
          order_number: string
          product_summary: string
          quantity: number
          status: Database["public"]["Enums"]["order_status"]
          total_amount: number | null
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          currency?: string | null
          expected_delivery?: string | null
          id?: string
          order_number: string
          product_summary: string
          quantity: number
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number | null
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          currency?: string | null
          expected_delivery?: string | null
          id?: string
          order_number?: string
          product_summary?: string
          quantity?: number
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number | null
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      production_batches: {
        Row: {
          id: string
          order_id: string
          style_number: string
          total_quantity: number
          status: string
          qr_code_hash: string
          material_item_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_id: string
          style_number: string
          total_quantity: number
          status?: string
          qr_code_hash?: string
          material_item_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          style_number?: string
          total_quantity?: number
          status?: string
          qr_code_hash?: string
          material_item_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_batches_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_batches_material_item_id_fkey"
            columns: ["material_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      production_phases: {
        Row: {
          id: string
          name: string
          sequence_order: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          sequence_order: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          sequence_order?: number
          created_at?: string
        }
        Relationships: []
      }
      batch_worker_sessions: {
        Row: {
          id: string
          batch_id: string
          phase_id: string
          worker_id: string
          start_time: string
          end_time: string | null
          status: "active" | "completed" | "cancelled"
          quantity_completed: number
          quantity_wasted: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          batch_id: string
          phase_id: string
          worker_id: string
          start_time?: string
          end_time?: string | null
          status?: "active" | "completed" | "cancelled"
          quantity_completed?: number
          quantity_wasted?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          batch_id?: string
          phase_id?: string
          worker_id?: string
          start_time?: string
          end_time?: string | null
          status?: "active" | "completed" | "cancelled"
          quantity_completed?: number
          quantity_wasted?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_worker_sessions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "production_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_worker_sessions_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "production_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_batch_assignments: {
        Row: {
          id: string
          manager_id: string
          batch_id: string
          assigned_at: string
          assigned_by: string | null
        }
        Insert: {
          id?: string
          manager_id: string
          batch_id: string
          assigned_at?: string
          assigned_by?: string | null
        }
        Update: {
          id?: string
          manager_id?: string
          batch_id?: string
          assigned_at?: string
          assigned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manager_batch_assignments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "production_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          wage_type: "piece_rate" | "monthly_salary" | null
          base_salary: number | null
          default_piece_rate: number | null
          skills: string[] | null
          employee_id: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
          wage_type?: "piece_rate" | "monthly_salary" | null
          base_salary?: number | null
          default_piece_rate?: number | null
          skills?: string[] | null
          employee_id?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          wage_type?: "piece_rate" | "monthly_salary" | null
          base_salary?: number | null
          default_piece_rate?: number | null
          skills?: string[] | null
          employee_id?: string | null
        }
        Relationships: []
      }
      rfqs: {
        Row: {
          assigned_to: string | null
          company: string | null
          created_at: string
          email: string
          id: string
          message: string
          name: string
          notes: string | null
          phone: string | null
          product_type: string | null
          quantity: string | null
          status: Database["public"]["Enums"]["rfq_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          company?: string | null
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          notes?: string | null
          phone?: string | null
          product_type?: string | null
          quantity?: string | null
          status?: Database["public"]["Enums"]["rfq_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          notes?: string | null
          phone?: string | null
          product_type?: string | null
          quantity?: string | null
          status?: Database["public"]["Enums"]["rfq_status"]
          updated_at?: string
        }
        Relationships: []
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "staff" | "client" | "worker" | "manager"
      movement_type: "in" | "out" | "adjust"
      order_status:
        | "pending"
        | "in_production"
        | "qc"
        | "shipped"
        | "delivered"
        | "cancelled"
      rfq_status: "new" | "contacted" | "quoted" | "won" | "lost"
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
      app_role: ["admin", "staff", "client", "worker"],
      movement_type: ["in", "out", "adjust"],
      order_status: [
        "pending",
        "in_production",
        "qc",
        "shipped",
        "delivered",
        "cancelled",
      ],
      rfq_status: ["new", "contacted", "quoted", "won", "lost"],
    },
  },
} as const
