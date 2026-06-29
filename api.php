<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-cache, no-store, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ===== STORAGE ENGINE =====
// Try SQLite first (most reliable), then JSON file fallback

class Storage {
    private $db = null;
    private $jsonFile;
    private $useSQLite = false;

    public function __construct() {
        $this->jsonFile = __DIR__ . '/database.json';
        
        // Try SQLite
        if (class_exists('SQLite3') || extension_loaded('pdo_sqlite')) {
            try {
                $dbPath = __DIR__ . '/spalatorie.db';
                $this->db = new PDO('sqlite:' . $dbPath);
                $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $this->db->exec("CREATE TABLE IF NOT EXISTS app_data (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    data TEXT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )");
                $this->useSQLite = true;
            } catch (Exception $e) {
                $this->useSQLite = false;
            }
        }
    }

    public function save($jsonString) {
        $success = false;
        $errors = [];

        // Try SQLite
        if ($this->useSQLite && $this->db) {
            try {
                $stmt = $this->db->prepare("INSERT OR REPLACE INTO app_data (id, data, updated_at) VALUES (1, :data, datetime('now'))");
                $stmt->execute([':data' => $jsonString]);
                $success = true;
            } catch (Exception $e) {
                $errors[] = 'SQLite: ' . $e->getMessage();
            }
        }

        // Also try JSON file (as backup)
        $dirPath = dirname($this->jsonFile);
        if (is_writable($dirPath)) {
            $result = @file_put_contents($this->jsonFile, $jsonString, LOCK_EX);
            if ($result !== false) {
                $success = true;
            } else {
                $errors[] = 'JSON file: write failed';
            }
        } else {
            $errors[] = 'JSON file: directory not writable';
        }

        return ['success' => $success, 'errors' => $errors, 'engine' => $this->useSQLite ? 'SQLite' : 'JSON'];
    }

    public function load() {
        // Try SQLite first
        if ($this->useSQLite && $this->db) {
            try {
                $stmt = $this->db->query("SELECT data FROM app_data WHERE id = 1");
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($row && !empty($row['data'])) {
                    return $row['data'];
                }
            } catch (Exception $e) {
                // fall through to JSON
            }
        }

        // Try JSON file
        if (file_exists($this->jsonFile)) {
            $data = @file_get_contents($this->jsonFile);
            if ($data !== false && !empty($data)) {
                return $data;
            }
        }

        return null;
    }

    public function getInfo() {
        return [
            'sqlite_available' => $this->useSQLite,
            'json_file' => $this->jsonFile,
            'json_dir_writable' => is_writable(dirname($this->jsonFile)),
            'json_file_exists' => file_exists($this->jsonFile),
            'json_file_writable' => file_exists($this->jsonFile) ? is_writable($this->jsonFile) : false,
            'php_version' => PHP_VERSION,
            'engine' => $this->useSQLite ? 'SQLite' : 'JSON'
        ];
    }
}

$storage = new Storage();

// ===== DIAGNOSTIC ENDPOINT =====
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['diagnose'])) {
    $info = $storage->getInfo();
    
    // Test write
    $testResult = $storage->save(json_encode(['test' => true, 'time' => date('Y-m-d H:i:s')]));
    $info['write_test'] = $testResult;
    
    // Test read
    $readData = $storage->load();
    $info['read_test'] = $readData !== null ? 'OK' : 'FAILED';
    
    echo json_encode($info, JSON_PRETTY_PRINT);
    exit;
}

// ===== POST: Save Data =====
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $inputJSON = file_get_contents('php://input');
    $input = json_decode($inputJSON, true);

    if ($input !== null) {
        $result = $storage->save($inputJSON);
        
        if ($result['success']) {
            echo json_encode(['status' => 'success', 'engine' => $result['engine']]);
        } else {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Save failed', 'details' => $result['errors']]);
        }
    } else {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid JSON input']);
    }
    exit;
}

// ===== GET: Load Data =====
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $data = $storage->load();
    
    if ($data !== null) {
        echo $data;
    } else {
        echo json_encode(['equipments' => null, 'history' => null, 'announcement' => null]);
    }
    exit;
}

http_response_code(405);
echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed']);
?>
