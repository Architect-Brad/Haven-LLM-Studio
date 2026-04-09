#include "model_manager.h"
#include <filesystem>
#include <algorithm>

namespace haven {

namespace fs = std::filesystem;

ModelManager::ModelManager(const std::string& models_directory)
    : models_dir_(models_directory) {
    scanForModels();
}

ModelManager::~ModelManager() = default;

std::vector<ModelInfo> ModelManager::listModels() const {
    return cached_models_;
}

std::optional<ModelInfo> ModelManager::getModelInfo(const std::string& model_path) const {
    for (const auto& model : cached_models_) {
        if (model.path == model_path) {
            return model;
        }
    }
    return std::nullopt;
}

bool ModelManager::downloadFromHuggingFace(
    const std::string& repo_id,
    const std::string& filename,
    DownloadProgressCallback callback
) {
    // TODO: Implement HuggingFace download
    // This would be called from the Node.js layer via N-API
    return false;
}

bool ModelManager::deleteModel(const std::string& model_path) {
    try {
        fs::path file_path(model_path);
        if (fs::exists(file_path) && fs::is_regular_file(file_path)) {
            fs::remove(file_path);
            scanForModels();
            return true;
        }
    } catch (const std::exception& e) {
        // Log error
    }
    return false;
}

void ModelManager::scanForModels() {
    cached_models_.clear();

    try {
        if (fs::exists(models_dir_) && fs::is_directory(models_dir_)) {
            scanDirectory(models_dir_);
        }
    } catch (const std::exception& e) {
        // Log error
    }
}

void ModelManager::scanDirectory(const std::string& path) {
    try {
        for (const auto& entry : fs::directory_iterator(path)) {
            if (entry.is_regular_file() && isModelFile(entry.path().filename().string())) {
                ModelInfo info;
                info.path = entry.path().string();
                info.name = entry.path().filename().string();
                info.size_bytes = entry.file_size();

                // Detect type
                std::string ext = entry.path().extension().string();
                std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
                if (ext == ".gguf") info.type = "GGUF";
                else if (ext == ".ggml") info.type = "GGML";
                else if (ext == ".bin") info.type = "GPTQ";
                else if (ext == ".safetensors") info.type = "SafeTensors";
                else info.type = "Unknown";

                cached_models_.push_back(info);
            }
        }
    } catch (const std::exception& e) {
        // Log error
    }
}

bool ModelManager::isModelFile(const std::string& filename) const {
    std::string lower = filename;
    std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);

    const std::vector<std::string> extensions = {
        ".gguf", ".ggml", ".bin", ".safetensors"
    };

    for (const auto& ext : extensions) {
        if (lower.size() >= ext.size() &&
            lower.compare(lower.size() - ext.size(), ext.size(), ext) == 0) {
            return true;
        }
    }
    return false;
}

} // namespace haven
