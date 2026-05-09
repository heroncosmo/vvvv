"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupabaseUrl = getSupabaseUrl;
exports.getSupabaseServiceKey = getSupabaseServiceKey;
exports.createSupabaseServiceClient = createSupabaseServiceClient;
var supabase_js_1 = require("@supabase/supabase-js");
function getSupabaseUrl() {
    return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
}
function getSupabaseServiceKey() {
    return (process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        "");
}
function createSupabaseServiceClient() {
    var supabaseUrl = getSupabaseUrl();
    var supabaseServiceKey = getSupabaseServiceKey();
    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error("SUPABASE_URL e uma chave de servico do Supabase (SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY) sao obrigatorias no servidor.");
    }
    return (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey);
}
