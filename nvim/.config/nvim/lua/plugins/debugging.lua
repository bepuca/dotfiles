return {
    {
        "mfussenegger/nvim-dap-python",
        dependencies = { "WhoIsSethDaniel/mason-tool-installer.nvim" },
        lazy = true,
        -- defines mason installed debugpy
        config = function()
            require("dap-python").setup(vim.fn.stdpath("data") .. "/mason/packages/debugpy/venv/bin/python")
        end
    },
    {
        "rcarriga/nvim-dap-ui",
        dependencies = {
            "mfussenegger/nvim-dap",
            "nvim-neotest/nvim-nio",
            "mfussenegger/nvim-dap-python",
        },
        -- lazy load on first usage
        keys = {
            {"<leader>db", "<cmd>DapToggleBreakpoint<CR>", desc = "DAP Toggle Breakpoint"},
            {"<leader>dc", "<cmd>DapContinue<CR>", desc = "DAP Continue"},
        },
        config = function()
            local dap = require("dap")
            local dapui = require("dapui")

            dapui.setup()

            dap.listeners.before.attach.dapui_config = function()
                dapui.open()
            end
            dap.listeners.before.launch.dapui_config = function()
                dapui.open()
            end
            dap.listeners.before.event_terminated.dapui_config = function()
                dapui.close()
            end
            dap.listeners.before.event_exited.dapui_config = function()
                dapui.close()
            end
        end
    }
}
