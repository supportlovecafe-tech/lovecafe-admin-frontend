export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      cinemas: {
        Row: {
          id: string
          name: string
          location: string
          rating: string | null
          feature: string | null
          image_url: string | null
          owner_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          location: string
          rating?: string | null
          feature?: string | null
          image_url?: string | null
          owner_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          location?: string
          rating?: string | null
          feature?: string | null
          image_url?: string | null
          owner_id?: string | null
          created_at?: string
        }
      }
      screens: {
        Row: {
          id: string
          cinema_id: string | null
          name: string
          floor: string | null
          tag: string | null
          created_at: string
        }
        Insert: {
          id?: string
          cinema_id?: string | null
          name: string
          floor?: string | null
          tag?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          cinema_id?: string | null
          name?: string
          floor?: string | null
          tag?: string | null
          created_at?: string
        }
      }
      food_items: {
        Row: {
          id: string
          cinema_id: string | null
          name: string
          description: string | null
          price: number
          image_url: string | null
          category: string
          is_available: boolean
          created_at: string
        }
        Insert: {
          id?: string
          cinema_id?: string | null
          name: string
          description?: string | null
          price: number
          image_url?: string | null
          category: string
          is_available?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          cinema_id?: string | null
          name?: string
          description?: string | null
          price?: number
          image_url?: string | null
          category?: string
          is_available?: boolean
          created_at?: string
        }
      }
      customer_profiles: {
        Row: {
          id: string
          phone: string | null
          password: string | null
          first_name: string
          last_name: string
          email: string | null
          loyalty_points: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          phone?: string | null
          password?: string | null
          first_name: string
          last_name: string
          email?: string | null
          loyalty_points?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          phone?: string | null
          password?: string | null
          first_name?: string
          last_name?: string
          email?: string | null
          loyalty_points?: number
          created_at?: string
          updated_at?: string
        }
      }
      orders: {
        Row: {
          id: string
          display_id: string | null
          cinema_id: string | null
          customer_id: string | null
          customer_profile_id: string | null
          items: Json
          total_amount: number
          status: string
          location: string
          payment_status: string
          payment_method: string
          customer_phone: string
          is_demo_order: boolean
          points_earned: number
          points_redeemed: number
          timestamp: string
        }
        Insert: {
          id?: string
          display_id?: string | null
          cinema_id?: string | null
          customer_id?: string | null
          customer_profile_id?: string | null
          items?: Json
          total_amount?: number
          status?: string
          location: string
          payment_status?: string
          payment_method?: string
          customer_phone: string
          is_demo_order?: boolean
          points_earned?: number
          points_redeemed?: number
          timestamp?: string
        }
        Update: {
          id?: string
          display_id?: string | null
          cinema_id?: string | null
          customer_id?: string | null
          customer_profile_id?: string | null
          items?: Json
          total_amount?: number
          status?: string
          location?: string
          payment_status?: string
          payment_method?: string
          customer_phone?: string
          is_demo_order?: boolean
          points_earned?: number
          points_redeemed?: number
          timestamp?: string
        }
      }
      order_messages: {
        Row: {
          id: string
          order_id: string | null
          sender_role: string
          content: string
          created_at: string
          is_read: boolean
        }
        Insert: {
          id?: string
          order_id?: string | null
          sender_role: string
          content: string
          created_at?: string
          is_read?: boolean
        }
        Update: {
          id?: string
          order_id?: string | null
          sender_role?: string
          content?: string
          created_at?: string
          is_read?: boolean
        }
      }
      offers: {
        Row: {
          id: string
          cinema_id: string | null
          category: string
          title: string
          description: string | null
          is_active: boolean
          discount_percentage: number | null
          flat_discount_amount: number | null
          promo_price: number | null
          buy_quantity: number | null
          get_quantity: number | null
          banner_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cinema_id?: string | null
          category: string
          title: string
          description?: string | null
          is_active?: boolean
          discount_percentage?: number | null
          flat_discount_amount?: number | null
          promo_price?: number | null
          buy_quantity?: number | null
          get_quantity?: number | null
          banner_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cinema_id?: string | null
          category?: string
          title?: string
          description?: string | null
          is_active?: boolean
          discount_percentage?: number | null
          flat_discount_amount?: number | null
          promo_price?: number | null
          buy_quantity?: number | null
          get_quantity?: number | null
          banner_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      offer_items: {
        Row: {
          id: string
          offer_id: string
          food_item_id: string
          custom_price: number | null
          created_at: string
        }
        Insert: {
          id?: string
          offer_id: string
          food_item_id: string
          custom_price?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          offer_id?: string
          food_item_id?: string
          custom_price?: number | null
          created_at?: string
        }
      }
    }
  }
}
