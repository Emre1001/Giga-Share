use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Friend {
    /// iroh EndpointId (Ed25519 public key) as lowercase hex.
    pub id: String,
    pub display_name: String,
    pub added_at: u64,
}

/// `GIGA-XXXX-...` — 64 hex chars in 16 groups of 4.
pub fn encode_code(id_hex: &str) -> String {
    let groups: Vec<String> = id_hex
        .to_uppercase()
        .as_bytes()
        .chunks(4)
        .map(|c| String::from_utf8_lossy(c).into_owned())
        .collect();
    format!("GIGA-{}", groups.join("-"))
}

/// Accepts the formatted code, or bare hex, with any spacing/case. Returns lowercase hex id.
pub fn decode_code(code: &str) -> Result<String, String> {
    let s = code.trim().to_lowercase();
    let s = s.strip_prefix("giga-").unwrap_or(&s);
    let hex_str: String = s.chars().filter(|c| c.is_ascii_hexdigit()).collect();
    if hex_str.len() != 64 || s.chars().any(|c| !(c.is_ascii_hexdigit() || c == '-' || c.is_whitespace())) {
        return Err("Invalid friend code".into());
    }
    let bytes: [u8; 32] = hex::decode(&hex_str)
        .map_err(|_| "Invalid friend code".to_string())?
        .try_into()
        .map_err(|_| "Invalid friend code".to_string())?;
    iroh::PublicKey::from_bytes(&bytes).map_err(|_| "Friend code is not a valid key".to_string())?;
    Ok(hex_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let key = iroh::SecretKey::generate().public();
        let hex_id = hex::encode(key.as_bytes());
        let code = encode_code(&hex_id);
        assert_eq!(code.len(), 5 + 64 + 15);
        assert_eq!(decode_code(&code).unwrap(), hex_id);
        assert_eq!(decode_code(&format!("  {}  ", code.to_lowercase())).unwrap(), hex_id);
        assert!(decode_code("GIGA-1234").is_err());
        assert!(decode_code(&code.replace('A', "Z")).is_err() || !code.contains('A'));
    }
}
