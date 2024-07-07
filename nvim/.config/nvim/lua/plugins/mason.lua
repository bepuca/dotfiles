return {
    {
        "williamboman/mason.nvim",
        opts = {
            ui = {
                icons = {
                    package_installed = "✓",
                    package_pending = "➜",
                    package_uninstalled = "✗"
                }
            }
        }
    },
    {
        "WhoIsSethDaniel/mason-tool-installer.nvim",
        dependencies = {
            "williamboman/mason.nvim",
            -- maps lspconfig name to mason package name
            "williamboman/mason-lspconfig.nvim"
        },
        opts = {
            ensure_installed = {
                -- LSPs
                "lua_ls",
                "pyright",
                -- DAPs
                "debugpy",
                -- Lint / Format
                "ruff",
            }
        }
    }
}
