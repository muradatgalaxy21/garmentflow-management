import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase configuration. VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log(`Testing connection to Supabase at ${supabaseUrl}...`);
  
  // Checking the 'garments' table specifically
  const { data, error } = await supabase.from('garments').select('*').limit(1);
  
  if (error) {
    console.error("❌ Error fetching from 'garments' table:", error.message);
    
    // In your schema, the garments table seems to be named 'inventory_items', so we try that as a fallback
    console.log("---------------------------------------------------------");
    console.log("Checking if 'inventory_items' works as a fallback...");
    const { data: fallbackData, error: fallbackError } = await supabase.from('inventory_items').select('*').limit(1);
    
    if (fallbackError) {
      console.error("❌ Fallback error (inventory_items):", fallbackError.message);
    } else {
      console.log("✅ Success! Fetched from 'inventory_items':");
      console.log(fallbackData);
    }
  } else {
    console.log("✅ Success! Fetched from 'garments':");
    console.log(data);
  }
}

testConnection();
