use std::fmt;

use serde::Serialize;
use zeroize::Zeroizing;

use super::TmdbError;

const MAX_KEY_BYTES: usize = 4_096;

#[cfg(target_os = "macos")]
const KEYCHAIN_SERVICE: &str = "com.aurelientrouble.sylloge.tmdb";
#[cfg(target_os = "macos")]
const KEYCHAIN_ACCOUNT: &str = "api-read-access-token";

pub struct SecretValue(Zeroizing<String>);

impl SecretValue {
    pub fn new(value: String) -> Self {
        Self(Zeroizing::new(value))
    }

    pub fn expose(&self) -> &str {
        self.0.as_str()
    }
}

impl fmt::Debug for SecretValue {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("SecretValue([REDACTED])")
    }
}

pub trait SecretStore: Send + Sync {
    fn get_secret(&self) -> Result<Option<SecretValue>, TmdbError>;
    fn set_secret(&self, secret: &SecretValue) -> Result<(), TmdbError>;
    fn delete_secret(&self) -> Result<(), TmdbError>;
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TmdbKeyStatus {
    configured: bool,
}

pub struct SecretService<Store> {
    store: Store,
}

impl<Store> SecretService<Store>
where
    Store: SecretStore,
{
    pub fn new(store: Store) -> Self {
        Self { store }
    }

    pub fn status(&self) -> Result<TmdbKeyStatus, TmdbError> {
        Ok(TmdbKeyStatus {
            configured: self.store.get_secret()?.is_some(),
        })
    }

    pub fn configure(&self, secret: SecretValue) -> Result<TmdbKeyStatus, TmdbError> {
        validate_secret(&secret)?;
        self.store.set_secret(&secret)?;
        Ok(TmdbKeyStatus { configured: true })
    }

    pub fn delete(&self) -> Result<TmdbKeyStatus, TmdbError> {
        self.store.delete_secret()?;
        Ok(TmdbKeyStatus { configured: false })
    }
}

fn validate_secret(secret: &SecretValue) -> Result<(), TmdbError> {
    let value = secret.expose();
    if value.is_empty()
        || value.len() > MAX_KEY_BYTES
        || value.trim() != value
        || value.chars().any(char::is_control)
    {
        return Err(TmdbError::InvalidKey);
    }

    Ok(())
}

#[derive(Clone, Copy, Debug, Default)]
pub struct PlatformSecretStore;

pub fn platform_secret_store() -> PlatformSecretStore {
    PlatformSecretStore
}

#[cfg(target_os = "macos")]
impl SecretStore for PlatformSecretStore {
    fn get_secret(&self) -> Result<Option<SecretValue>, TmdbError> {
        match macos_keychain::get_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)? {
            Some(bytes) => {
                let bytes = Zeroizing::new(bytes);
                let value = std::str::from_utf8(bytes.as_slice())
                    .map_err(|_| TmdbError::SecureStorageUnavailable)?;
                Ok(Some(SecretValue::new(value.to_owned())))
            }
            None => Ok(None),
        }
    }

    fn set_secret(&self, secret: &SecretValue) -> Result<(), TmdbError> {
        macos_keychain::set_generic_password(
            KEYCHAIN_SERVICE,
            KEYCHAIN_ACCOUNT,
            secret.expose().as_bytes(),
        )
    }

    fn delete_secret(&self) -> Result<(), TmdbError> {
        macos_keychain::delete_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
    }
}

#[cfg(not(target_os = "macos"))]
impl SecretStore for PlatformSecretStore {
    fn get_secret(&self) -> Result<Option<SecretValue>, TmdbError> {
        Err(TmdbError::SecureStorageUnsupported)
    }

    fn set_secret(&self, _secret: &SecretValue) -> Result<(), TmdbError> {
        Err(TmdbError::SecureStorageUnsupported)
    }

    fn delete_secret(&self) -> Result<(), TmdbError> {
        Err(TmdbError::SecureStorageUnsupported)
    }
}

#[cfg(target_os = "macos")]
mod macos_keychain {
    use std::ffi::c_void;
    use std::ptr;
    use std::slice;

    use super::TmdbError;

    type CfIndex = isize;
    type CfTypeRef = *const c_void;
    type CfDictionaryRef = *const c_void;
    type CfDataRef = *const c_void;
    type OsStatus = i32;

    const CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;
    const ERR_SEC_SUCCESS: OsStatus = 0;
    const ERR_SEC_DUPLICATE_ITEM: OsStatus = -25_299;
    const ERR_SEC_ITEM_NOT_FOUND: OsStatus = -25_300;

    #[repr(C)]
    struct CfDictionaryKeyCallbacks {
        _private: [u8; 0],
    }

    #[repr(C)]
    struct CfDictionaryValueCallbacks {
        _private: [u8; 0],
    }

    #[link(name = "Security", kind = "framework")]
    extern "C" {
        static kSecClass: CfTypeRef;
        static kSecClassGenericPassword: CfTypeRef;
        static kSecAttrService: CfTypeRef;
        static kSecAttrAccount: CfTypeRef;
        static kSecValueData: CfTypeRef;
        static kSecReturnData: CfTypeRef;

        fn SecItemAdd(attributes: CfDictionaryRef, result: *mut CfTypeRef) -> OsStatus;
        fn SecItemCopyMatching(query: CfDictionaryRef, result: *mut CfTypeRef) -> OsStatus;
        fn SecItemUpdate(query: CfDictionaryRef, attributes_to_update: CfDictionaryRef)
            -> OsStatus;
        fn SecItemDelete(query: CfDictionaryRef) -> OsStatus;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        static kCFBooleanTrue: CfTypeRef;
        static kCFTypeDictionaryKeyCallBacks: CfDictionaryKeyCallbacks;
        static kCFTypeDictionaryValueCallBacks: CfDictionaryValueCallbacks;

        fn CFStringCreateWithBytes(
            allocator: CfTypeRef,
            bytes: *const u8,
            byte_count: CfIndex,
            encoding: u32,
            is_external_representation: u8,
        ) -> CfTypeRef;
        fn CFDataCreate(allocator: CfTypeRef, bytes: *const u8, byte_count: CfIndex) -> CfDataRef;
        fn CFDataGetBytePtr(data: CfDataRef) -> *const u8;
        fn CFDataGetLength(data: CfDataRef) -> CfIndex;
        fn CFDataGetTypeID() -> usize;
        fn CFGetTypeID(value: CfTypeRef) -> usize;
        fn CFDictionaryCreate(
            allocator: CfTypeRef,
            keys: *const CfTypeRef,
            values: *const CfTypeRef,
            count: CfIndex,
            key_callbacks: *const CfDictionaryKeyCallbacks,
            value_callbacks: *const CfDictionaryValueCallbacks,
        ) -> CfDictionaryRef;
        fn CFRelease(value: CfTypeRef);
    }

    struct OwnedCf(CfTypeRef);

    impl OwnedCf {
        fn new(value: CfTypeRef) -> Result<Self, TmdbError> {
            if value.is_null() {
                Err(TmdbError::SecureStorageUnavailable)
            } else {
                Ok(Self(value))
            }
        }

        fn as_ptr(&self) -> CfTypeRef {
            self.0
        }
    }

    impl Drop for OwnedCf {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe { CFRelease(self.0) };
            }
        }
    }

    pub fn get_generic_password(
        service: &str,
        account: &str,
    ) -> Result<Option<Vec<u8>>, TmdbError> {
        let service = cf_string(service)?;
        let account = cf_string(account)?;
        let query = generic_password_query(&service, &account, true)?;
        let mut result = ptr::null();
        let status = unsafe { SecItemCopyMatching(query.as_ptr(), &mut result) };

        if status == ERR_SEC_ITEM_NOT_FOUND {
            return Ok(None);
        }
        require_success(status)?;

        let data = OwnedCf::new(result)?;
        let is_data = unsafe { CFGetTypeID(data.as_ptr()) == CFDataGetTypeID() };
        if !is_data {
            return Err(TmdbError::SecureStorageUnavailable);
        }
        let length = unsafe { CFDataGetLength(data.as_ptr()) };
        let length = usize::try_from(length).map_err(|_| TmdbError::SecureStorageUnavailable)?;
        if length == 0 {
            return Ok(Some(Vec::new()));
        }
        let bytes = unsafe { CFDataGetBytePtr(data.as_ptr()) };
        if bytes.is_null() {
            return Err(TmdbError::SecureStorageUnavailable);
        }

        Ok(Some(
            unsafe { slice::from_raw_parts(bytes, length) }.to_vec(),
        ))
    }

    pub fn set_generic_password(
        service: &str,
        account: &str,
        password: &[u8],
    ) -> Result<(), TmdbError> {
        let service = cf_string(service)?;
        let account = cf_string(account)?;
        let password = cf_data(password)?;
        let query = generic_password_query(&service, &account, false)?;
        let update = cf_dictionary(&[(unsafe { kSecValueData }, password.as_ptr())])?;
        let update_status = unsafe { SecItemUpdate(query.as_ptr(), update.as_ptr()) };

        if update_status == ERR_SEC_SUCCESS {
            return Ok(());
        }
        if update_status != ERR_SEC_ITEM_NOT_FOUND {
            return Err(TmdbError::SecureStorageUnavailable);
        }

        let add = cf_dictionary(&[
            (unsafe { kSecClass }, unsafe { kSecClassGenericPassword }),
            (unsafe { kSecAttrService }, service.as_ptr()),
            (unsafe { kSecAttrAccount }, account.as_ptr()),
            (unsafe { kSecValueData }, password.as_ptr()),
        ])?;
        let add_status = unsafe { SecItemAdd(add.as_ptr(), ptr::null_mut()) };
        if add_status == ERR_SEC_DUPLICATE_ITEM {
            require_success(unsafe { SecItemUpdate(query.as_ptr(), update.as_ptr()) })
        } else {
            require_success(add_status)
        }
    }

    pub fn delete_generic_password(service: &str, account: &str) -> Result<(), TmdbError> {
        let service = cf_string(service)?;
        let account = cf_string(account)?;
        let query = generic_password_query(&service, &account, false)?;
        let status = unsafe { SecItemDelete(query.as_ptr()) };
        if status == ERR_SEC_SUCCESS || status == ERR_SEC_ITEM_NOT_FOUND {
            Ok(())
        } else {
            Err(TmdbError::SecureStorageUnavailable)
        }
    }

    fn generic_password_query(
        service: &OwnedCf,
        account: &OwnedCf,
        return_data: bool,
    ) -> Result<OwnedCf, TmdbError> {
        let mut entries = vec![
            (unsafe { kSecClass }, unsafe { kSecClassGenericPassword }),
            (unsafe { kSecAttrService }, service.as_ptr()),
            (unsafe { kSecAttrAccount }, account.as_ptr()),
        ];
        if return_data {
            entries.push((unsafe { kSecReturnData }, unsafe { kCFBooleanTrue }));
        }
        cf_dictionary(&entries)
    }

    fn cf_string(value: &str) -> Result<OwnedCf, TmdbError> {
        let length =
            CfIndex::try_from(value.len()).map_err(|_| TmdbError::SecureStorageUnavailable)?;
        let value = unsafe {
            CFStringCreateWithBytes(
                ptr::null(),
                value.as_ptr(),
                length,
                CF_STRING_ENCODING_UTF8,
                0,
            )
        };
        OwnedCf::new(value)
    }

    fn cf_data(value: &[u8]) -> Result<OwnedCf, TmdbError> {
        let length =
            CfIndex::try_from(value.len()).map_err(|_| TmdbError::SecureStorageUnavailable)?;
        OwnedCf::new(unsafe { CFDataCreate(ptr::null(), value.as_ptr(), length) })
    }

    fn cf_dictionary(entries: &[(CfTypeRef, CfTypeRef)]) -> Result<OwnedCf, TmdbError> {
        let count =
            CfIndex::try_from(entries.len()).map_err(|_| TmdbError::SecureStorageUnavailable)?;
        let keys: Vec<CfTypeRef> = entries.iter().map(|(key, _)| *key).collect();
        let values: Vec<CfTypeRef> = entries.iter().map(|(_, value)| *value).collect();
        let dictionary = unsafe {
            CFDictionaryCreate(
                ptr::null(),
                keys.as_ptr(),
                values.as_ptr(),
                count,
                ptr::addr_of!(kCFTypeDictionaryKeyCallBacks),
                ptr::addr_of!(kCFTypeDictionaryValueCallBacks),
            )
        };
        OwnedCf::new(dictionary)
    }

    fn require_success(status: OsStatus) -> Result<(), TmdbError> {
        if status == ERR_SEC_SUCCESS {
            Ok(())
        } else {
            Err(TmdbError::SecureStorageUnavailable)
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;

    #[derive(Default)]
    struct FakeSecretStore {
        secret: Mutex<Option<String>>,
    }

    impl SecretStore for FakeSecretStore {
        fn get_secret(&self) -> Result<Option<SecretValue>, TmdbError> {
            Ok(self
                .secret
                .lock()
                .expect("faux magasin lisible")
                .as_ref()
                .map(|value| SecretValue::new(value.clone())))
        }

        fn set_secret(&self, secret: &SecretValue) -> Result<(), TmdbError> {
            *self.secret.lock().expect("faux magasin inscriptible") =
                Some(secret.expose().to_owned());
            Ok(())
        }

        fn delete_secret(&self) -> Result<(), TmdbError> {
            *self.secret.lock().expect("faux magasin supprimable") = None;
            Ok(())
        }
    }

    #[test]
    fn fake_store_covers_absent_configured_and_deleted_statuses() {
        let service = SecretService::new(FakeSecretStore::default());

        assert_eq!(
            service.status().expect("statut absent"),
            TmdbKeyStatus { configured: false }
        );
        assert_eq!(
            service
                .configure(SecretValue::new("fake-token-for-tests".to_string()))
                .expect("configuration factice"),
            TmdbKeyStatus { configured: true }
        );
        assert_eq!(
            service.status().expect("statut configuré"),
            TmdbKeyStatus { configured: true }
        );
        assert_eq!(
            service.delete().expect("suppression factice"),
            TmdbKeyStatus { configured: false }
        );
        assert_eq!(
            service.status().expect("statut supprimé"),
            TmdbKeyStatus { configured: false }
        );
    }

    #[test]
    fn secret_debug_and_status_never_expose_the_value() {
        let secret = SecretValue::new("fake-token-for-redaction".to_string());
        assert_eq!(format!("{secret:?}"), "SecretValue([REDACTED])");

        let serialized = serde_json::to_string(&TmdbKeyStatus { configured: true })
            .expect("statut sérialisable");
        assert_eq!(serialized, r#"{"configured":true}"#);
        assert!(!serialized.contains("token"));
    }

    #[test]
    fn invalid_secret_is_rejected_before_the_store_is_changed() {
        let service = SecretService::new(FakeSecretStore::default());
        let error = service
            .configure(SecretValue::new(" fake-token ".to_string()))
            .expect_err("espaces interdits");

        assert_eq!(error, TmdbError::InvalidKey);
        assert_eq!(
            service.status().expect("statut après rejet"),
            TmdbKeyStatus { configured: false }
        );
    }
}
