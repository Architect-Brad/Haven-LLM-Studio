{
  "targets": [
    {
      "target_name": "haven_core",
      "type": "loadable_module",
      "sources": [
        "src/haven_addon.cpp",
        "src/inference_engine.cpp",
        "src/model_manager.cpp",
        "src/optimization_layer.cpp"
      ],
      "include_dirs": [
        "src",
        "<!@(node -p \"require('node-addon-api').include\")",
        "third_party/llama.cpp/include",
        "third_party/llama.cpp/ggml/include"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "GGML_USE_CPU"
      ],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "12.0",
            "OTHER_LDFLAGS": [
              "-lllama",
              "-lggml",
              "-framework Accelerate",
              "-framework Foundation"
            ]
          },
          "link_settings": {
            "library_dirs": [
              "<(module_root_dir)/build/Release"
            ]
          }
        }],
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalIncludeDirectories": [
                "third_party/llama.cpp/include",
                "third_party/llama.cpp/ggml/include"
              ]
            },
            "VCLinkerTool": {
              "AdditionalDependencies": [
                "llama.lib",
                "ggml.lib"
              ],
              "AdditionalLibraryDirectories": [
                "<(module_root_dir)/build/Release"
              ]
            }
          }
        }],
        ["OS=='linux'", {
          "cflags_cc": [ "-fexceptions" ],
          "link_settings": {
            "libraries": [
              "-lllama",
              "-lggml"
            ],
            "library_dirs": [
              "<(module_root_dir)/build/Release"
            ]
          }
        }]
      ]
    }
  ]
}
