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
        "mfussenegger/nvim-dap",
        dependencies = {
            "nvim-neotest/nvim-nio",
            "mfussenegger/nvim-dap-python",
        },
        -- lazy load on first usage
        keys = {
            {"<leader>db", "<cmd>DapToggleBreakpoint<CR>", desc = "Toggle [B]reakpoint"},
            {"<leader>dc", "<cmd>DapContinue<CR>", desc = "[C]ontinue"},
        },
        config = function()
            -- use pre-defined syntax groups for coloring debug information
            vim.fn.sign_define("DapBreakpoint", {text="●", texthl="debug", numhl="", linehl=""})
            vim.fn.sign_define("DapStopped", {text="→", texthl="debug", numhl="", linehl="todo" })

            -- adds .vscode/launch.js from current folder to dap configurations
            require("dap.ext.vscode").load_launchjs()

            local dap = require("dap")
            local widgets = require("dap.ui.widgets")

            vim.keymap.set('n', '<Leader>dB',
                function() dap.set_breakpoint(nil, nil, vim.fn.input("Condition: ")) end, { desc = "Toggle Conditional [B]reakpoint" }
            )

            vim.keymap.set("n", "<leader>dl", dap.run_last, { desc = "Run [L]ast" })
            vim.keymap.set("n", "<leader>ds", widgets.sidebar(widgets.frames).toggle, { desc = "Toggle [S]tack" })
            vim.keymap.set("n", "<leader>dr", dap.repl.toggle, { desc = "Toggle [R]epl"} )
            vim.keymap.set("n", "<leader>dv", widgets.sidebar(widgets.scopes).toggle, { desc = "Toggle [V]ariables"} )

            vim.keymap.set("n", "<leader>dn", dap.step_over, { desc = "Step [N]ext"} )
            vim.keymap.set("n", "<leader>di", dap.step_into, { desc = "Step [I]nto"} )
            vim.keymap.set("n", "<leader>do", dap.step_out, { desc = "Step [O]ut"} )
            vim.keymap.set("n", "<leader>df", dap.focus_frame, { desc = "Focus [F]rame"} )
        end
    }
}
