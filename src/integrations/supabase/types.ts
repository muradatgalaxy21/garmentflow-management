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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_access_codes: {
        Row: {
          attempts: number
          code: string
          created_at: string
          expires_at: string
          id: string
          requester_email: string
          requester_name: string | null
          used: boolean
        }
        Insert: {
          attempts?: number
          code: string
          created_at?: string
          expires_at: string
          id?: string
          requester_email: string
          requester_name?: string | null
          used?: boolean
        }
        Update: {
          attempts?: number
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          requester_email?: string
          requester_name?: string | null
          used?: boolean
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
          type: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          title: string
          type: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          type?: string
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
      batch_department_status: {
        Row: {
          batch_id: string
          closed_at: string | null
          closed_by: string | null
          department: string
          end_enabled: boolean
          end_verification_status: string
          opened_at: string
          opened_by: string | null
          start_verification_status: string
          status: string
        }
        Insert: {
          batch_id: string
          closed_at?: string | null
          closed_by?: string | null
          department: string
          end_enabled?: boolean
          end_verification_status?: string
          opened_at?: string
          opened_by?: string | null
          start_verification_status?: string
          status?: string
        }
        Update: {
          batch_id?: string
          closed_at?: string | null
          closed_by?: string | null
          department?: string
          end_enabled?: boolean
          end_verification_status?: string
          opened_at?: string
          opened_by?: string | null
          start_verification_status?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_department_status_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "production_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_dispatches: {
        Row: {
          batch_id: string
          carrier: string | null
          carton_count: number
          created_at: string
          created_by: string | null
          dispatch_date: string
          dispatch_note: string | null
          id: string
        }
        Insert: {
          batch_id: string
          carrier?: string | null
          carton_count: number
          created_at?: string
          created_by?: string | null
          dispatch_date: string
          dispatch_note?: string | null
          id?: string
        }
        Update: {
          batch_id?: string
          carrier?: string | null
          carton_count?: number
          created_at?: string
          created_by?: string | null
          dispatch_date?: string
          dispatch_note?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_dispatches_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "production_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_pack_ratios: {
        Row: {
          batch_id: string
          ratio: Json
          set_by: string | null
          updated_at: string
        }
        Insert: {
          batch_id: string
          ratio: Json
          set_by?: string | null
          updated_at?: string
        }
        Update: {
          batch_id?: string
          ratio?: Json
          set_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_pack_ratios_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: true
            referencedRelation: "production_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_phase_rates: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          phase_id: string
          quantity_locked: boolean
          rate_per_piece: number
          updated_at: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          phase_id: string
          quantity_locked?: boolean
          rate_per_piece?: number
          updated_at?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          phase_id?: string
          quantity_locked?: boolean
          rate_per_piece?: number
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
      batch_phase_status: {
        Row: {
          batch_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          phase_id: string
          status: string
          updated_at: string
        }
        Insert: {
          batch_id: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          phase_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          batch_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          phase_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_phase_status_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "production_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_phase_status_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "production_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_tracking: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          notes: string | null
          phase_id: string
          quantity_completed: number
          quantity_wasted: number
          worker_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          notes?: string | null
          phase_id: string
          quantity_completed?: number
          quantity_wasted?: number
          worker_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          phase_id?: string
          quantity_completed?: number
          quantity_wasted?: number
          worker_id?: string
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
      batch_worker_sessions: {
        Row: {
          batch_id: string
          created_at: string
          end_time: string | null
          id: string
          notes: string | null
          phase_id: string
          quantity_completed: number | null
          quantity_wasted: number | null
          start_time: string
          status: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          end_time?: string | null
          id?: string
          notes?: string | null
          phase_id: string
          quantity_completed?: number | null
          quantity_wasted?: number | null
          start_time?: string
          status?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          end_time?: string | null
          id?: string
          notes?: string | null
          phase_id?: string
          quantity_completed?: number | null
          quantity_wasted?: number | null
          start_time?: string
          status?: string
          updated_at?: string
          worker_id?: string
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
      bundle_quality_checks: {
        Row: {
          alter_reason: string | null
          batch_id: string
          bundle_id: string
          checked_at: string
          checked_by: string
          id: string
          reject_reason: string | null
          routed_to_department: string | null
          verdict: string
        }
        Insert: {
          alter_reason?: string | null
          batch_id: string
          bundle_id: string
          checked_at?: string
          checked_by: string
          id?: string
          reject_reason?: string | null
          routed_to_department?: string | null
          verdict: string
        }
        Update: {
          alter_reason?: string | null
          batch_id?: string
          bundle_id?: string
          checked_at?: string
          checked_by?: string
          id?: string
          reject_reason?: string | null
          routed_to_department?: string | null
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundle_quality_checks_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "production_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_quality_checks_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "production_bundles"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_transfers: {
        Row: {
          bundle_id: string
          created_at: string
          from_sub_dept: string | null
          id: string
          pcs: number
          to_sub_dept: string
          worker_id: string
        }
        Insert: {
          bundle_id: string
          created_at?: string
          from_sub_dept?: string | null
          id?: string
          pcs: number
          to_sub_dept: string
          worker_id: string
        }
        Update: {
          bundle_id?: string
          created_at?: string
          from_sub_dept?: string | null
          id?: string
          pcs?: number
          to_sub_dept?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundle_transfers_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "production_bundles"
            referencedColumns: ["id"]
          },
        ]
      }
      department_cost_rates: {
        Row: {
          department: string
          id: string
          label: string
          rate: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          department: string
          id?: string
          label: string
          rate: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          department?: string
          id?: string
          label?: string
          rate?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      department_entries: {
        Row: {
          batch_id: string
          created_at: string
          department: string
          id: string
          inventory_item_id: string | null
          payload: Json
          stage: string
          total_cost: number | null
          worker_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          department: string
          id?: string
          inventory_item_id?: string | null
          payload: Json
          stage?: string
          total_cost?: number | null
          worker_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          department?: string
          id?: string
          inventory_item_id?: string | null
          payload?: Json
          stage?: string
          total_cost?: number | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_entries_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "production_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_entries_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      department_sequence: {
        Row: {
          department: string
          order_index: number
          parallel_group: number
        }
        Insert: {
          department: string
          order_index: number
          parallel_group: number
        }
        Update: {
          department?: string
          order_index?: number
          parallel_group?: number
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          attributes: Json
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
          attributes?: Json
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
          attributes?: Json
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
      manager_batch_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          batch_id: string
          id: string
          manager_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          batch_id: string
          id?: string
          manager_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          batch_id?: string
          id?: string
          manager_id?: string
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
          color_breakdown: Json
          created_at: string
          currency: string | null
          expected_delivery: string | null
          id: string
          order_number: string
          party_name: string | null
          product_summary: string
          quantity: number
          status: Database["public"]["Enums"]["order_status"]
          total_amount: number | null
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          color_breakdown?: Json
          created_at?: string
          currency?: string | null
          expected_delivery?: string | null
          id?: string
          order_number: string
          party_name?: string | null
          product_summary: string
          quantity: number
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number | null
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          color_breakdown?: Json
          created_at?: string
          currency?: string | null
          expected_delivery?: string | null
          id?: string
          order_number?: string
          party_name?: string | null
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
          created_at: string
          id: string
          material_item_id: string | null
          order_id: string
          qr_code_hash: string
          status: string
          style_number: string
          total_quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_item_id?: string | null
          order_id: string
          qr_code_hash?: string
          status?: string
          style_number: string
          total_quantity: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          material_item_id?: string | null
          order_id?: string
          qr_code_hash?: string
          status?: string
          style_number?: string
          total_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_batches_material_item_id_fkey"
            columns: ["material_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_batches_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_bundles: {
        Row: {
          batch_id: string
          bundle_no: number
          created_at: string
          created_by: string | null
          id: string
          lot_no: string
          pcs_count: number
        }
        Insert: {
          batch_id: string
          bundle_no: number
          created_at?: string
          created_by?: string | null
          id?: string
          lot_no: string
          pcs_count: number
        }
        Update: {
          batch_id?: string
          bundle_no?: number
          created_at?: string
          created_by?: string | null
          id?: string
          lot_no?: string
          pcs_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_bundles_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "production_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      production_phases: {
        Row: {
          created_at: string
          id: string
          name: string
          sequence_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sequence_order: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sequence_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          base_salary: number | null
          client_activated: boolean
          company: string | null
          created_at: string
          default_piece_rate: number | null
          department: string | null
          email: string | null
          employee_id: string | null
          full_name: string | null
          id: string
          phone: string | null
          skills: string[] | null
          sub_department: string | null
          updated_at: string
          wage_type: string | null
        }
        Insert: {
          base_salary?: number | null
          client_activated?: boolean
          company?: string | null
          created_at?: string
          default_piece_rate?: number | null
          department?: string | null
          email?: string | null
          employee_id?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          skills?: string[] | null
          sub_department?: string | null
          updated_at?: string
          wage_type?: string | null
        }
        Update: {
          base_salary?: number | null
          client_activated?: boolean
          company?: string | null
          created_at?: string
          default_piece_rate?: number | null
          department?: string | null
          email?: string | null
          employee_id?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          skills?: string[] | null
          sub_department?: string | null
          updated_at?: string
          wage_type?: string | null
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
      client_inbox_messages: {
        Row: {
          client_id: string
          created_at: string
          id: string
          message: string
          order_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          type: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          message: string
          order_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          type?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          message?: string
          order_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_inbox_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invite_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string
          email: string | null
          expires_at: string
          id: string
          order_id: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          status: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          email?: string | null
          expires_at: string
          id?: string
          order_id?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          status?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          email?: string | null
          expires_at?: string
          id?: string
          order_id?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_invite_codes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_inbox_messages: {
        Row: {
          batch_id: string | null
          created_at: string
          department: string | null
          id: string
          message: string
          payload: Json | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          type: string
          worker_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          department?: string | null
          id?: string
          message: string
          payload?: Json | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          type: string
          worker_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          department?: string | null
          id?: string
          message?: string
          payload?: Json | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          type?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_inbox_messages_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "production_batches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      bundle_quality_status: {
        Row: {
          alter_reason: string | null
          batch_id: string | null
          bundle_id: string | null
          checked_at: string | null
          checked_by: string | null
          is_quality_complete: boolean | null
          latest_verdict: string | null
          reject_reason: string | null
          routed_to_department: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bundle_quality_checks_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "production_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_quality_checks_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "production_bundles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_worker_enter_phase: {
        Args: { _phase_id: string; _worker_id: string }
        Returns: boolean
      }
      has_batch_access: {
        Args: { _batch_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_previous_phase_closed: {
        Args: { _batch_id: string; _phase_id: string }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "staff", "client", "worker", "manager"],
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
