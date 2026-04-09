#ifndef HAVEN_MODEL_MANAGER_H
#define HAVEN_MODEL_MANAGER_H

#include "haven_core.h"
#include <string>
#include <vector>
#include <optional>

namespace haven {

// Download progress callback
using DownloadProgressCallback = std::function<void(double progress, double speed_mbps)>;

class ModelManager {
public:
    ModelManager(const std::string& models_directory);
    ~ModelManager();
    
    // List all downloaded models
    std::vector<ModelInfo> listModels() const;
    
    // Get model info by name/path
    std::optional<ModelInfo> getModelInfo(const std::string& model_path) const;
    
    // Download model from HuggingFace
    bool downloadFromHuggingFace(
        const std::string& repo_id,
        const std::string& filename,
        DownloadProgressCallback callback = nullptr
    );
    
    // Delete model
    bool deleteModel(const std::string& model_path);
    
    // Get models directory
    const std::string& getModelsDirectory() const { return models_dir_; }
    
    // Scan for new models
    void scanForModels();

private:
    std::string models_dir_;
    std::vector<ModelInfo> cached_models_;
    
    void scanDirectory(const std::string& path);
    bool isModelFile(const std::string& filename) const;
};

} // namespace haven

#endif // HAVEN_MODEL_MANAGER_H
